using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using BiteGo.Api.Models;

namespace BiteGo.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "admin")]
    public class AdminController : ControllerBase
    {
        private readonly BiteGoContext _context;

        public AdminController(BiteGoContext context)
        {
            _context = context;
        }

        #region Orders Management

        [HttpGet("orders")]
        public async Task<IActionResult> GetAllOrders([FromQuery] int? statusId)
        {
            var query = _context.Orders
                .Include(o => o.Status)
                .Include(o => o.User)
                .Include(o => o.Courier)
                .Include(o => o.Items)
                    .ThenInclude(i => i.Product)
                .AsQueryable();

            if (statusId.HasValue && statusId > 0)
                query = query.Where(o => o.StatusId == statusId.Value);

            var orders = await query
                .OrderByDescending(o => o.CreatedAt)
                .ToListAsync();

            var result = orders.Select(o => new
            {
                o.Id,
                o.OrderNumber,
                o.StatusId,
                StatusCode = o.Status.Code,
                StatusName = o.Status.Name,
                CustomerName = o.User.FullName,
                CustomerPhone = o.User.Phone,
                o.DeliveryAddressText,
                o.Subtotal,
                o.BonusPointsUsed,
                o.BonusPointsEarned,
                o.TotalAmount,
                o.PaymentMethod,
                o.PaymentStatus,
                o.EstimatedCookingMinutes,
                o.EstimatedDeliveryTime,
                o.CustomerNote,
                o.IssueType,
                o.IssueComment,
                o.CancellationReason,
                o.CreatedAt,
                o.DeliveredAt,
                o.CompletedAt,
                Courier = o.Courier != null ? new
                {
                    o.Courier.Id,
                    o.Courier.FullName,
                    o.Courier.Phone,
                    o.Courier.Status
                } : null,
                Items = o.Items.Select(i => new
                {
                    i.ProductId,
                    ProductName = i.Product.Name,
                    i.Quantity,
                    i.UnitPrice,
                    i.TotalPrice,
                    i.ExcludedIngredientsText,
                    i.AddedAddonsText
                }).ToList()
            });

            return Ok(result);
        }

        [HttpPatch("order/{orderId}/status")]
        public async Task<IActionResult> UpdateOrderStatus(int orderId, [FromBody] UpdateStatusDto request)
        {
            var order = await _context.Orders
                .Include(o => o.Courier)
                .Include(o => o.Items)
                .FirstOrDefaultAsync(o => o.Id == orderId);

            if (order == null) return NotFound(new { message = "Заказ не найден" });

            if (order.StatusId == 6 || order.StatusId == 7)
            {
                return BadRequest(new { message = "Заказ уже находится в завершенном статусе (Получен или Отменен). Смена статуса заблокирована." });
            }

            var oldStatusId = order.StatusId;
            order.StatusId = request.NewStatusId;

            if (request.NewStatusId == 5) // Доставлен
            {
                order.DeliveredAt = DateTime.UtcNow;
            }
            else if (request.NewStatusId == 7) // Отменен
            {
                order.CancellationReason = request.Reason ?? "Отменен администратором";
                // Возврат товара на склад при отмене
                foreach (var item in order.Items)
                {
                    var product = await _context.Products.FindAsync(item.ProductId);
                    if (product != null)
                    {
                        product.StockQuantity += item.Quantity;
                        _context.StockLogs.Add(new StockLog
                        {
                            ProductId = product.Id,
                            ChangeType = "Возврат (отмена)",
                            QuantityChange = item.Quantity,
                            RemainingStock = product.StockQuantity,
                            Reason = $"Возврат по отмене заказа {order.OrderNumber}",
                            CreatedAt = DateTime.UtcNow
                        });
                    }
                }
                // Освобождаем курьера, если был назначен
                if (order.Courier != null && order.Courier.Status == "На доставке")
                {
                    order.Courier.Status = "Свободен";
                }
            }

            await _context.SaveChangesAsync();
            return Ok(new { message = $"Статус заказа изменен с {oldStatusId} на {request.NewStatusId}" });
        }

        [HttpPatch("order/{orderId}/assign-courier")]
        public async Task<IActionResult> AssignCourier(int orderId, [FromBody] AssignCourierDto request)
        {
            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var order = await _context.Orders.FindAsync(orderId);
                if (order == null) return NotFound(new { message = "Заказ не найден" });

                var courier = await _context.Couriers.FindAsync(request.CourierId);
                if (courier == null) return NotFound(new { message = "Курьер не найден" });

                // Проверка занятости курьера (защита от повторного назначения!)
                if (courier.Status != "Свободен")
                {
                    return BadRequest(new { message = $"Курьер «{courier.FullName}» сейчас занят (статус: {courier.Status}) и не может взять новый заказ!" });
                }

                // Переводим курьера в статус "На доставке"
                courier.Status = "На доставке";

                // Назначаем на заказ и переводим заказ в статус 4 ("В пути")
                order.CourierId = courier.Id;
                order.StatusId = 4; // В пути

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return Ok(new
                {
                    message = $"Курьер {courier.FullName} успешно назначен на заказ {order.OrderNumber}. Заказ переведен в статус «В пути»."
                });
            }
            catch (DbUpdateConcurrencyException)
            {
                await transaction.RollbackAsync();
                return Conflict(new { message = "Курьер был назначен другим оператором одновременно. Пожалуйста, обновите список." });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { message = "Ошибка назначения курьера: " + ex.Message });
            }
        }

        [HttpPost("order/{orderId}/resolve-issue")]
        public async Task<IActionResult> ResolveOrderIssue(int orderId, [FromBody] ResolveIssueDto request)
        {
            var order = await _context.Orders
                .Include(o => o.Courier)
                .Include(o => o.User)
                .FirstOrDefaultAsync(o => o.Id == orderId);

            if (order == null) return NotFound(new { message = "Заказ не найден" });
            if (order.StatusId != 8) return BadRequest(new { message = "По данному заказу нет активной претензии" });

            if (request.Action == "resolve")
            {
                order.StatusId = 6; // Завершен
                order.CompletedAt = DateTime.UtcNow;
                order.IssueComment = $"{order.IssueComment} | УРЕГУЛИРОВАНО: {request.ResolutionNote ?? "Претензия клиента удовлетворена"}";

                if (order.User != null)
                {
                    order.User.BonusPoints += 100;
                    order.BonusPointsEarned += 100;
                }

                if (order.Courier != null)
                {
                    order.Courier.Status = "Свободен";
                }
            }
            else
            {
                order.StatusId = 6; // Завершен
                order.CompletedAt = DateTime.UtcNow;
                order.IssueComment = $"{order.IssueComment} | ОТКЛОНЕНО: {request.ResolutionNote ?? "Факт доставки подтвержден курьером"}";

                if (order.Courier != null)
                {
                    order.Courier.Status = "Свободен";
                }
            }

            await _context.SaveChangesAsync();
            return Ok(new { message = "Претензия успешно обработана администратором" });
        }

        [HttpGet("feedbacks")]
        public async Task<IActionResult> GetFeedbacks()
        {
            var reviews = await _context.Reviews
                .Include(r => r.User)
                .Include(r => r.Order)
                .OrderByDescending(r => r.CreatedAt)
                .Select(r => new
                {
                    r.Id,
                    r.OrderId,
                    OrderNumber = r.Order != null ? r.Order.OrderNumber : "",
                    CustomerName = r.User.FullName,
                    CustomerPhone = r.User.Phone,
                    r.Rating,
                    r.Comment,
                    r.CreatedAt
                })
                .ToListAsync();

            var issues = await _context.Orders
                .Where(o => o.StatusId == 8)
                .Include(o => o.User)
                .Include(o => o.Courier)
                .OrderByDescending(o => o.CreatedAt)
                .Select(o => new
                {
                    o.Id,
                    o.OrderNumber,
                    CustomerName = o.User.FullName,
                    CustomerPhone = o.User.Phone,
                    CourierName = o.Courier != null ? o.Courier.FullName : "Не назначен",
                    o.TotalAmount,
                    o.IssueType,
                    o.IssueComment,
                    o.CreatedAt
                })
                .ToListAsync();

            return Ok(new { reviews, issues });
        }

        #endregion

        #region Couriers Management

        [HttpGet("couriers")]
        public async Task<IActionResult> GetCouriers()
        {
            var couriers = await _context.Couriers
                .OrderBy(c => c.Status == "Свободен" ? 0 : c.Status == "На доставке" ? 1 : 2)
                .ThenBy(c => c.FullName)
                .ToListAsync();

            return Ok(couriers);
        }

        [HttpPatch("couriers/{id}/status")]
        public async Task<IActionResult> ToggleCourierStatus(int id, [FromBody] UpdateCourierStatusDto request)
        {
            var courier = await _context.Couriers.FindAsync(id);
            if (courier == null) return NotFound(new { message = "Курьер не найден" });

            courier.Status = request.NewStatus;
            await _context.SaveChangesAsync();
            return Ok(courier);
        }

        #endregion

        #region Stock Management (Склад и поставки)

        [HttpGet("stock")]
        public async Task<IActionResult> GetStock()
        {
            var products = await _context.Products
                .Include(p => p.Category)
                .Where(p => p.IsActive)
                .OrderBy(p => p.CategoryId)
                .ThenBy(p => p.Name)
                .Select(p => new
                {
                    p.Id,
                    CategoryName = p.Category!.Name,
                    p.Name,
                    p.Price,
                    p.ImageUrl,
                    p.StockQuantity,
                    IsAvailable = p.StockQuantity > 0,
                    p.IsActive
                })
                .ToListAsync();

            return Ok(products);
        }

        [HttpPost("stock/replenish")]
        public async Task<IActionResult> ReplenishStock([FromBody] ReplenishStockDto request)
        {
            if (request.Quantity <= 0)
                return BadRequest(new { message = "Количество для пополнения должно быть больше нуля" });

            var product = await _context.Products.FindAsync(request.ProductId);
            if (product == null) return NotFound(new { message = "Блюдо не найдено" });

            var adminId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            // Пополняем остаток
            product.StockQuantity += request.Quantity;

            // Добавляем запись в журнал движения склада
            var stockLog = new StockLog
            {
                ProductId = product.Id,
                ChangeType = "Поступление",
                QuantityChange = request.Quantity,
                RemainingStock = product.StockQuantity,
                CostPerUnit = request.CostPerUnit > 0 ? request.CostPerUnit : 150.00m,
                Reason = string.IsNullOrWhiteSpace(request.Reason) 
                    ? "Плановая поставка свежих полуфабрикатов" 
                    : request.Reason.Trim(),
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = adminId
            };

            _context.StockLogs.Add(stockLog);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = $"Остаток блюда «{product.Name}» успешно пополнен на +{request.Quantity} шт. Текущий остаток: {product.StockQuantity} шт.",
                product.StockQuantity
            });
        }

        [HttpPost("stock/stop")]
        public async Task<IActionResult> StopListProduct([FromBody] StopProductDto request)
        {
            var product = await _context.Products.FindAsync(request.ProductId);
            if (product == null) return NotFound(new { message = "Блюдо не найдено" });

            var adminId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var prevStock = product.StockQuantity;
            product.StockQuantity = 0;

            _context.StockLogs.Add(new StockLog
            {
                ProductId = product.Id,
                ChangeType = "Корректировка (стоп-лист)",
                QuantityChange = -prevStock,
                RemainingStock = 0,
                Reason = string.IsNullOrWhiteSpace(request.Reason) 
                    ? "Позиция отправлена в стоп-лист (закончились ингредиенты)" 
                    : request.Reason.Trim(),
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = adminId
            });

            await _context.SaveChangesAsync();
            return Ok(new { message = $"Позиция «{product.Name}» поставлена в стоп-лист (остаток обнулен)." });
        }

        [HttpPost("products")]
        public async Task<IActionResult> CreateProduct([FromBody] CreateProductDto request)
        {
            if (string.IsNullOrWhiteSpace(request.Name) || request.Price <= 0)
                return BadRequest(new { message = "Укажите корректное название и цену блюда" });

            var adminId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            var product = new Product
            {
                Name = request.Name.Trim(),
                CategoryId = request.CategoryId,
                Price = request.Price,
                WeightGram = request.WeightGram > 0 ? request.WeightGram : 350,
                CaloriesKcal = request.CaloriesKcal > 0 ? request.CaloriesKcal : 600,
                CookingTimeMinutes = request.CookingTimeMinutes > 0 ? request.CookingTimeMinutes : 15,
                StockQuantity = request.InitialStock >= 0 ? request.InitialStock : 20,
                Description = !string.IsNullOrWhiteSpace(request.Description) ? request.Description.Trim() : "Фирменное свежеприготовленное блюдо BiteGo.",
                ImageUrl = !string.IsNullOrWhiteSpace(request.ImageUrl) ? request.ImageUrl.Trim() : "/assets/images/product-6.jpg",
                IsActive = true
            };

            _context.Products.Add(product);
            await _context.SaveChangesAsync();

            if (product.StockQuantity > 0)
            {
                _context.StockLogs.Add(new StockLog
                {
                    ProductId = product.Id,
                    ChangeType = "Поступление (новое блюдо)",
                    QuantityChange = product.StockQuantity,
                    RemainingStock = product.StockQuantity,
                    CostPerUnit = request.Price * 0.45m,
                    Reason = "Первичное оприходование новой позиции меню",
                    CreatedAt = DateTime.UtcNow,
                    CreatedByUserId = adminId
                });
                await _context.SaveChangesAsync();
            }

            return Ok(new
            {
                message = $"Блюдо «{product.Name}» успешно добавлено в меню!",
                product = new
                {
                    product.Id,
                    product.Name,
                    product.Price,
                    product.StockQuantity,
                    product.ImageUrl
                }
            });
        }

        [HttpDelete("products/{id}")]
        public async Task<IActionResult> DeleteProduct(int id)
        {
            var product = await _context.Products.FindAsync(id);
            if (product == null) return NotFound(new { message = "Блюдо не найдено" });

            var adminId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            // Проверяем, участвовало ли блюдо в заказах
            bool hasOrders = await _context.OrderItems.AnyAsync(oi => oi.ProductId == id);
            if (hasOrders)
            {
                // Мягкое удаление (деактивация), чтобы не нарушать исторические чеки
                product.IsActive = false;
                product.StockQuantity = 0;
                _context.StockLogs.Add(new StockLog
                {
                    ProductId = product.Id,
                    ChangeType = "Вывод из меню (архивация)",
                    QuantityChange = 0,
                    RemainingStock = 0,
                    Reason = "Блюдо снято с продажи и архивировано администратором",
                    CreatedAt = DateTime.UtcNow,
                    CreatedByUserId = adminId
                });
            }
            else
            {
                // Жесткое удаление, если заказов не было
                var logs = _context.StockLogs.Where(l => l.ProductId == id);
                _context.StockLogs.RemoveRange(logs);
                _context.Products.Remove(product);
            }

            await _context.SaveChangesAsync();
            return Ok(new { message = $"Блюдо «{product.Name}» успешно удалено из меню." });
        }

        [HttpGet("stock/history")]
        public async Task<IActionResult> GetStockHistory([FromQuery] int? productId)
        {
            var query = _context.StockLogs
                .Include(s => s.Product)
                .Include(s => s.CreatedByUser)
                .AsQueryable();

            if (productId.HasValue && productId > 0)
                query = query.Where(s => s.ProductId == productId.Value);

            var logs = await query
                .OrderByDescending(s => s.CreatedAt)
                .Take(50)
                .Select(s => new
                {
                    s.Id,
                    s.ProductId,
                    ProductName = s.Product.Name,
                    s.ChangeType,
                    s.QuantityChange,
                    s.RemainingStock,
                    s.CostPerUnit,
                    TotalCost = s.CostPerUnit.HasValue ? s.CostPerUnit.Value * Math.Abs(s.QuantityChange) : 0,
                    s.Reason,
                    s.CreatedAt,
                    OperatorName = s.CreatedByUser != null ? s.CreatedByUser.FullName : "Система"
                })
                .ToListAsync();

            return Ok(logs);
        }

        #endregion

        #region Financial and Operational Statistics

        [HttpGet("stats")]
        public async Task<IActionResult> GetStatistics([FromQuery] string period = "all")
        {
            // Ресторанное время кухни (Балашов / МСК: UTC+3)
            var localNow = DateTime.UtcNow.AddHours(3);
            DateTime fromDateLocal;
            DateTime? toDateLocal = null;

            switch (period?.ToLower())
            {
                case "today":
                    fromDateLocal = localNow.Date;
                    toDateLocal = localNow.Date.AddDays(1);
                    break;
                case "yesterday":
                    fromDateLocal = localNow.Date.AddDays(-1);
                    toDateLocal = localNow.Date;
                    break;
                case "week":
                    fromDateLocal = localNow.Date.AddDays(-6);
                    toDateLocal = localNow.Date.AddDays(1);
                    break;
                case "month":
                    fromDateLocal = localNow.Date.AddDays(-29);
                    toDateLocal = localNow.Date.AddDays(1);
                    break;
                default:
                    period = "all";
                    fromDateLocal = DateTime.MinValue;
                    toDateLocal = null;
                    break;
            }

            var fromDateUtc = fromDateLocal == DateTime.MinValue ? DateTime.MinValue : fromDateLocal.AddHours(-3);
            var toDateUtc = toDateLocal?.AddHours(-3);

            // 1. Все заказы за выбранный период
            var ordersQuery = _context.Orders
                .Include(o => o.Items)
                    .ThenInclude(i => i.Product)
                        .ThenInclude(p => p.Category)
                .Include(o => o.Status)
                .Where(o => o.CreatedAt >= fromDateUtc && (!toDateUtc.HasValue || o.CreatedAt < toDateUtc.Value));

            var allPeriodOrders = await ordersQuery.ToListAsync();
            var totalOrdersCount = allPeriodOrders.Count;

            // 2. Оплаченные/завершенные заказы за период (исключая отмененные)
            var completedOrders = allPeriodOrders
                .Where(o => o.StatusId != 7 && (o.StatusId == 5 || o.StatusId == 6 || o.PaymentStatus == "Оплачено"))
                .ToList();

            var completedOrdersCount = completedOrders.Count;
            var totalRevenue = completedOrders.Sum(o => o.TotalAmount);

            // 3. Себестоимость проданных блюд (COGS / Food Cost сырья)
            // В ресторанном бизнесе фудкост составляет в среднем 35-38% от отпускной цены.
            var totalFoodCost = completedOrders
                .SelectMany(o => o.Items)
                .Sum(i => Math.Round(i.Quantity * (i.UnitPrice * 0.38m), 2));

            // 4. ЗП курьеров (ставка 150 ₽ за каждый выполненный заказ)
            var totalCourierWages = completedOrdersCount * 150.00m;

            // 5. Валовая и Чистая прибыль бизнеса
            var grossProfit = totalRevenue - totalFoodCost;
            var netProfit = totalRevenue - totalFoodCost - totalCourierWages;
            var netProfitMargin = totalRevenue > 0 ? Math.Round((netProfit / totalRevenue) * 100m, 1) : 0m;
            var averageCheck = completedOrdersCount > 0 ? Math.Round(totalRevenue / completedOrdersCount, 2) : 0m;

            // 6. Стоимость товарных остатков на складе (Активы кухни)
            var totalWarehouseValue = await _context.Products
                .Where(p => p.IsActive)
                .SumAsync(p => p.StockQuantity * Math.Round(p.Price * 0.38m, 2));

            // 7. Общие расходы на оптовые закупки из StockLog (Капитальные закупки сырья)
            var supplyLogsQuery = _context.StockLogs
                .Where(s => s.CreatedAt >= fromDateUtc && (!toDateUtc.HasValue || s.CreatedAt < toDateUtc.Value) && s.ChangeType == "Поступление");
            var totalSupplyCosts = await supplyLogsQuery.SumAsync(s => (s.CostPerUnit ?? 0) * s.QuantityChange);

            // 8. Динамика выручки и заказов (для интерактивного графика)
            var dailyRevenueList = new List<object>();
            if (period == "today" || period == "yesterday")
            {
                var targetDay = period == "today" ? localNow.Date : localNow.Date.AddDays(-1);
                var dayOrders = completedOrders.Where(o => o.CreatedAt.AddHours(3).Date == targetDay).ToList();
                for (int hour = 10; hour <= 22; hour += 2)
                {
                    var slotOrders = dayOrders.Where(o => {
                        var h = o.CreatedAt.AddHours(3).Hour;
                        return h >= hour && h < hour + 2;
                    }).ToList();

                    dailyRevenueList.Add(new
                    {
                        Date = $"{hour:D2}:00",
                        DayLabel = $"{hour:D2}:00–{hour + 2:D2}:00",
                        Revenue = Math.Round(slotOrders.Sum(x => x.TotalAmount), 2),
                        OrdersCount = slotOrders.Count
                    });
                }
            }
            else
            {
                int daysBack = period == "week" ? 6 : (period == "month" ? 13 : 6);
                var startDate = localNow.Date.AddDays(-daysBack);
                for (var d = startDate; d <= localNow.Date; d = d.AddDays(1))
                {
                    var dayOrders = completedOrders.Where(o => o.CreatedAt.AddHours(3).Date == d).ToList();
                    string dayLabel = d.ToString("dd.MM");
                    string dayOfWeek = d.ToString("ddd", new System.Globalization.CultureInfo("ru-RU"));
                    dailyRevenueList.Add(new
                    {
                        Date = dayLabel,
                        DayLabel = $"{dayOfWeek}, {dayLabel}",
                        Revenue = Math.Round(dayOrders.Sum(x => x.TotalAmount), 2),
                        OrdersCount = dayOrders.Count
                    });
                }
            }

            // 9. Продажи по категориям блюд (для круговой диаграммы / структуры)
            var allItems = completedOrders.SelectMany(o => o.Items).ToList();
            var categorySales = allItems
                .GroupBy(i => i.Product?.Category?.Name ?? "Прочее")
                .Select(g => new
                {
                    CategoryName = g.Key,
                    TotalSum = Math.Round(g.Sum(x => x.TotalPrice), 2),
                    Count = g.Sum(x => x.Quantity),
                    Percentage = totalRevenue > 0 ? Math.Round((g.Sum(x => x.TotalPrice) / totalRevenue) * 100m, 1) : 0m
                })
                .OrderByDescending(x => x.TotalSum)
                .ToList();

            // 10. Топ-5 популярных блюд
            var topProducts = allItems
                .GroupBy(i => new { i.ProductId, i.Product.Name, i.Product.ImageUrl, CategoryName = i.Product.Category != null ? i.Product.Category.Name : "" })
                .Select(g => new
                {
                    g.Key.ProductId,
                    g.Key.Name,
                    g.Key.ImageUrl,
                    g.Key.CategoryName,
                    TotalSold = g.Sum(x => x.Quantity),
                    TotalSum = Math.Round(g.Sum(x => x.TotalPrice), 2)
                })
                .OrderByDescending(x => x.TotalSold)
                .Take(5)
                .ToList();

            // 11. Распределение заказов по статусам
            var ordersByStatus = allPeriodOrders
                .GroupBy(o => o.Status != null ? o.Status.Name : "Неизвестно")
                .Select(g => new
                {
                    StatusName = g.Key,
                    Count = g.Count()
                })
                .ToList();

            // 12. Способы оплаты
            var paymentMethods = completedOrders
                .GroupBy(o => string.IsNullOrWhiteSpace(o.PaymentMethod) ? "Карта онлайн" : o.PaymentMethod)
                .Select(g => new
                {
                    Method = g.Key,
                    Count = g.Count(),
                    TotalSum = Math.Round(g.Sum(x => x.TotalAmount), 2),
                    Percentage = totalRevenue > 0 ? Math.Round((g.Sum(x => x.TotalAmount) / totalRevenue) * 100m, 1) : 0m
                })
                .OrderByDescending(x => x.TotalSum)
                .ToList();

            return Ok(new
            {
                Period = period,
                TotalOrdersCount = totalOrdersCount,
                CompletedOrdersCount = completedOrdersCount,
                TotalRevenue = Math.Round(totalRevenue, 2),
                AverageCheck = averageCheck,
                TotalFoodCost = Math.Round(totalFoodCost, 2),
                FoodCostPercent = 38.0m,
                TotalCourierWages = Math.Round(totalCourierWages, 2),
                GrossProfit = Math.Round(grossProfit, 2),
                NetProfit = Math.Round(netProfit, 2),
                NetProfitMargin = netProfitMargin,
                TotalWarehouseValue = Math.Round(totalWarehouseValue, 2),
                TotalSupplyCosts = Math.Round(totalSupplyCosts, 2),
                DailyRevenue = dailyRevenueList,
                CategorySales = categorySales,
                PaymentMethods = paymentMethods,
                TopProducts = topProducts,
                OrdersByStatus = ordersByStatus
            });
        }

        #endregion
    }

    public record UpdateStatusDto(int NewStatusId, string? Reason);
    public record AssignCourierDto(int CourierId);
    public record UpdateCourierStatusDto(string NewStatus);
    public record ReplenishStockDto(int ProductId, int Quantity, decimal CostPerUnit, string Reason);
    public record StopProductDto(int ProductId, string Reason);
    public record CreateProductDto(string Name, int CategoryId, decimal Price, int WeightGram, int CaloriesKcal, int CookingTimeMinutes, int InitialStock, string? Description, string? ImageUrl);
    public record ResolveIssueDto(string Action, string? ResolutionNote);
}
