using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using BiteGo.Api.Models;

namespace BiteGo.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class OrderController : ControllerBase
    {
        private readonly BiteGoContext _context;

        public OrderController(BiteGoContext context)
        {
            _context = context;
        }

        [HttpPost]
        public async Task<IActionResult> CreateOrder([FromBody] CreateOrderDto request)
        {
            if (request.Items == null || request.Items.Count == 0)
                return BadRequest(new { message = "Корзина пуста" });

            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var user = await _context.Users.FindAsync(userId);
            if (user == null) return Unauthorized();

            if (user.Role == "admin")
            {
                return BadRequest(new { 
                    message = "Оформление заказа со служебного аккаунта администратора заблокировано в целях безопасности (разделение полномочий). Пожалуйста, используйте аккаунт покупателя." 
                });
            }

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                decimal subtotal = 0;
                int maxCookingMinutes = 15;
                var orderItems = new List<OrderItem>();
                var orderNumber = $"BG-{DateTime.Now:yyyyMMdd}-{Random.Shared.Next(1000, 9999)}";

                // 1. Проверяем остатки на складе и формируем состав
                foreach (var item in request.Items)
                {
                    var product = await _context.Products.FindAsync(item.ProductId);
                    if (product == null || !product.IsActive)
                        throw new InvalidOperationException($"Товар ID={item.ProductId} не найден или недоступен");

                    if (product.StockQuantity < item.Quantity)
                        throw new InvalidOperationException($"К сожалению, «{product.Name}» закончился на складе (осталось {product.StockQuantity} шт.)");

                    // Атомарное списание остатка
                    product.StockQuantity -= item.Quantity;

                    // Учитываем время готовки
                    if (product.CookingTimeMinutes > maxCookingMinutes)
                        maxCookingMinutes = product.CookingTimeMinutes;

                    // Скидка за убранные ингредиенты (40 ₽ за каждый убранный компонент, не менее 150 ₽ за основу)
                    var excludedCount = item.ExcludedIngredients?.Count ?? 0;
                    var unitEffectivePrice = Math.Max(150m, product.Price - (excludedCount * 40m));
                    var itemBasePrice = unitEffectivePrice * item.Quantity;
                    decimal addonsTotal = 0;
                    var addedAddonsList = new List<OrderItemAddon>();
                    var addedAddonNames = new List<string>();

                    if (item.AddonIds != null && item.AddonIds.Count > 0)
                    {
                        var addons = await _context.Addons
                            .Where(a => item.AddonIds.Contains(a.Id) && a.IsActive)
                            .ToListAsync();

                        foreach (var addon in addons)
                        {
                            var addonCost = addon.Price * item.Quantity;
                            addonsTotal += addonCost;
                            addedAddonNames.Add($"{addon.Name} (+{addon.Price:0} ₽)");
                            addedAddonsList.Add(new OrderItemAddon
                            {
                                AddonId = addon.Id,
                                AddonName = addon.Name,
                                Price = addon.Price
                            });
                        }
                    }

                    var itemTotalPrice = itemBasePrice + addonsTotal;
                    subtotal += itemTotalPrice;

                    var orderItem = new OrderItem
                    {
                        ProductId = product.Id,
                        Quantity = item.Quantity,
                        UnitPrice = unitEffectivePrice,
                        ItemsPrice = itemBasePrice,
                        AddonsPrice = addonsTotal,
                        TotalPrice = itemTotalPrice,
                        ExcludedIngredientsText = item.ExcludedIngredients != null && item.ExcludedIngredients.Count > 0
                            ? string.Join(", ", item.ExcludedIngredients.Select(e => $"Без {e}"))
                            : null,
                        AddedAddonsText = addedAddonNames.Count > 0 ? string.Join(", ", addedAddonNames) : null,
                        Addons = addedAddonsList
                    };

                    orderItems.Add(orderItem);

                    // Фиксация в журнале склада StockLog
                    _context.StockLogs.Add(new StockLog
                    {
                        ProductId = product.Id,
                        ChangeType = "Списание (заказ)",
                        QuantityChange = -item.Quantity,
                        RemainingStock = product.StockQuantity,
                        Reason = $"Списание по заказу {orderNumber}",
                        CreatedAt = DateTime.UtcNow,
                        CreatedByUserId = userId
                    });
                }

                // 2. Расчет бонусов
                int bonusToUse = 0;
                if (request.BonusPointsToUse > 0)
                {
                    // Ограничение: списать можно не больше 30% от суммы и не больше баланса
                    var maxBonusAllowed = (int)(subtotal * 0.30m);
                    bonusToUse = Math.Min(request.BonusPointsToUse, Math.Min(user.BonusPoints, maxBonusAllowed));
                    user.BonusPoints -= bonusToUse;
                }

                var deliveryFee = 0.00m; // Бесплатная доставка по Балашову
                var totalAmount = Math.Max(0, subtotal - bonusToUse + deliveryFee);

                // Ожидаемое время доставки: приготовление + 20 минут на путь по Балашову
                var totalEstimatedMinutes = maxCookingMinutes + 20;

                var order = new Order
                {
                    OrderNumber = orderNumber,
                    UserId = userId,
                    AddressId = request.AddressId,
                    DeliveryAddressText = request.DeliveryAddressText ?? "г. Балашов, адрес уточняется",
                    StatusId = 1, // 1 = Новый
                    Subtotal = subtotal,
                    BonusPointsUsed = bonusToUse,
                    BonusPointsEarned = 0, // Начисляются при статусе "Completed"
                    DeliveryFee = deliveryFee,
                    TotalAmount = totalAmount,
                    PaymentMethod = request.PaymentMethod == "Cash" ? "Наличными курьеру" : "Картой курьеру",
                    PaymentStatus = "Ожидает оплаты",
                    EstimatedCookingMinutes = maxCookingMinutes,
                    EstimatedDeliveryTime = DateTime.UtcNow.AddMinutes(totalEstimatedMinutes),
                    CustomerNote = request.CustomerNote,
                    CreatedAt = DateTime.UtcNow,
                    Items = orderItems
                };

                _context.Orders.Add(order);
                await _context.SaveChangesAsync();

                // Фиксация записи о платеже
                _context.Payments.Add(new Payment
                {
                    OrderId = order.Id,
                    PaymentMethod = order.PaymentMethod,
                    Amount = order.TotalAmount,
                    Status = "Ожидает оплаты",
                    CreatedAt = DateTime.UtcNow
                });
                await _context.SaveChangesAsync();

                await transaction.CommitAsync();

                return Ok(new
                {
                    order.Id,
                    order.OrderNumber,
                    order.TotalAmount,
                    order.StatusId,
                    StatusName = "Новый",
                    order.EstimatedDeliveryTime,
                    TotalEstimatedMinutes = totalEstimatedMinutes,
                    RemainingUserBonuses = user.BonusPoints
                });
            }
            catch (DbUpdateConcurrencyException)
            {
                await transaction.RollbackAsync();
                return Conflict(new { message = "Один из товаров был изменен или выкуплен другим клиентом. Пожалуйста, обновите корзину." });
            }
            catch (InvalidOperationException ex)
            {
                await transaction.RollbackAsync();
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { message = "Ошибка при оформлении заказа: " + ex.Message });
            }
        }

        [HttpGet("my")]
        public async Task<IActionResult> GetMyOrders()
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            var orders = await _context.Orders
                .Include(o => o.Status)
                .Include(o => o.Courier)
                .Include(o => o.Items)
                    .ThenInclude(i => i.Product)
                .Where(o => o.UserId == userId)
                .OrderByDescending(o => o.CreatedAt)
                .ToListAsync();

            var result = orders.Select(o => new
            {
                o.Id,
                o.OrderNumber,
                o.StatusId,
                StatusCode = o.Status.Code,
                StatusName = o.Status.Name,
                o.TotalAmount,
                o.Subtotal,
                o.BonusPointsUsed,
                o.BonusPointsEarned,
                o.PaymentMethod,
                o.PaymentStatus,
                o.DeliveryAddressText,
                o.CustomerNote,
                o.CreatedAt,
                o.EstimatedDeliveryTime,
                o.DeliveredAt,
                o.CompletedAt,
                Courier = o.Courier != null ? new
                {
                    o.Courier.FullName,
                    o.Courier.Phone,
                    o.Courier.PhotoUrl
                } : null,
                Items = o.Items.Select(i => new
                {
                    i.ProductId,
                    ProductName = i.Product.Name,
                    ProductImage = i.Product.ImageUrl,
                    i.Quantity,
                    i.UnitPrice,
                    i.TotalPrice,
                    i.ExcludedIngredientsText,
                    i.AddedAddonsText
                }).ToList()
            });

            return Ok(result);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetOrderDetails(int id)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var role = User.FindFirstValue(ClaimTypes.Role);

            var order = await _context.Orders
                .Include(o => o.Status)
                .Include(o => o.Courier)
                .Include(o => o.Items)
                    .ThenInclude(i => i.Product)
                .FirstOrDefaultAsync(o => o.Id == id && (role == "admin" || o.UserId == userId));

            if (order == null) return NotFound(new { message = "Заказ не найден" });

            // Определяем процент прогресса для трекера
            var progressPercent = order.StatusId switch
            {
                1 => 15,  // Новый
                2 => 40,  // Готовится
                3 => 65,  // Собран
                4 => 85,  // В пути
                5 => 95,  // Доставлен курьером (ждёт подтверждения клиента)
                6 => 100, // Получен клиентом (завершен)
                7 => 0,   // Отменен
                8 => 50,  // Жалоба
                _ => 10
            };

            var review = await _context.Reviews.FirstOrDefaultAsync(r => r.OrderId == order.Id);

            var nowUtc = DateTime.UtcNow;
            var createdUtc = DateTime.SpecifyKind(order.CreatedAt, DateTimeKind.Utc);
            var estimatedUtc = order.EstimatedDeliveryTime != default
                ? DateTime.SpecifyKind(order.EstimatedDeliveryTime, DateTimeKind.Utc)
                : createdUtc.AddMinutes(order.EstimatedCookingMinutes + 20);

            var totalEstimatedSeconds = (int)(estimatedUtc - createdUtc).TotalSeconds;
            var elapsedSeconds = Math.Max(0, (int)(nowUtc - createdUtc).TotalSeconds);
            var remainingSeconds = Math.Max(0, (int)(estimatedUtc - nowUtc).TotalSeconds);

            return Ok(new
            {
                order.Id,
                order.OrderNumber,
                order.StatusId,
                StatusCode = order.Status.Code,
                StatusName = order.Status.Name,
                StatusDescription = order.Status.Description,
                ProgressPercent = progressPercent,
                order.Subtotal,
                order.BonusPointsUsed,
                order.BonusPointsEarned,
                order.TotalAmount,
                order.PaymentMethod,
                order.PaymentStatus,
                order.DeliveryAddressText,
                order.CustomerNote,
                CreatedAt = createdUtc.ToString("o"),
                EstimatedDeliveryTime = estimatedUtc.ToString("o"),
                EstimatedCookingMinutes = order.EstimatedCookingMinutes,
                DeliveryMinutes = 20,
                TotalEstimatedMinutes = order.EstimatedCookingMinutes + 20,
                TotalEstimatedSeconds = totalEstimatedSeconds,
                ElapsedSeconds = elapsedSeconds,
                RemainingSeconds = remainingSeconds,
                order.DeliveredAt,
                order.CompletedAt,
                order.IssueType,
                order.IssueComment,
                Courier = order.Courier != null ? new
                {
                    order.Courier.Id,
                    order.Courier.FullName,
                    order.Courier.Phone,
                    order.Courier.PhotoUrl,
                    order.Courier.Status
                } : null,
                Review = review != null ? new
                {
                    review.Rating,
                    review.Comment,
                    review.CreatedAt
                } : null,
                Items = order.Items.Select(i => new
                {
                    i.ProductId,
                    ProductName = i.Product.Name,
                    ProductImage = i.Product.ImageUrl,
                    i.Quantity,
                    i.UnitPrice,
                    i.TotalPrice,
                    i.ExcludedIngredientsText,
                    i.AddedAddonsText
                }).ToList()
            });
        }

        [HttpPost("{id}/confirm")]
        public async Task<IActionResult> ConfirmDelivery(int id)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var order = await _context.Orders
                .Include(o => o.Courier)
                .FirstOrDefaultAsync(o => o.Id == id && o.UserId == userId);

            if (order == null) return NotFound(new { message = "Заказ не найден" });

            if (order.StatusId != 5) // 5 = Доставлен
                return BadRequest(new { message = "Подтвердить получение можно только после доставки курьером" });

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                order.StatusId = 6; // 6 = Получен клиентом (Completed)
                order.CompletedAt = DateTime.UtcNow;
                order.PaymentStatus = "Оплачено";

                // Начисляем 5% кэшбэка баллами за завершенный заказ
                var earnedPoints = (int)Math.Round(order.TotalAmount * 0.05m);
                order.BonusPointsEarned = earnedPoints;

                var user = await _context.Users.FindAsync(userId);
                if (user != null)
                {
                    user.BonusPoints += earnedPoints;
                }

                // Освобождаем курьера и увеличиваем его счетчик доставок
                if (order.Courier != null)
                {
                    order.Courier.Status = "Свободен";
                    order.Courier.TotalDeliveriesCount += 1;
                }

                // Обновляем статус платежа
                var payment = await _context.Payments.FirstOrDefaultAsync(p => p.OrderId == order.Id);
                if (payment != null)
                {
                    payment.Status = "Оплачено";
                    payment.PaidAt = DateTime.UtcNow;
                }

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return Ok(new
                {
                    message = "Спасибо! Заказ успешно получен.",
                    earnedBonusPoints = earnedPoints,
                    userTotalBonusPoints = user?.BonusPoints ?? 0
                });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { message = "Ошибка подтверждения: " + ex.Message });
            }
        }

        [HttpPost("{id}/issue")]
        public async Task<IActionResult> ReportIssue(int id, [FromBody] ReportIssueDto request)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var order = await _context.Orders.FirstOrDefaultAsync(o => o.Id == id && o.UserId == userId);

            if (order == null) return NotFound(new { message = "Заказ не найден" });

            order.StatusId = 8; // 8 = Жалоба на доставку
            order.IssueType = request.IssueType ?? "Не доставлено";
            order.IssueComment = request.Comment;

            await _context.SaveChangesAsync();
            return Ok(new { message = "Ваша жалоба зарегистрирована. Администратор свяжется с вами в течение 5 минут." });
        }

        [HttpPost("{id}/review")]
        public async Task<IActionResult> LeaveReview(int id, [FromBody] ReviewDto request)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var order = await _context.Orders
                .Include(o => o.Items)
                .FirstOrDefaultAsync(o => o.Id == id && o.UserId == userId);

            if (order == null) return NotFound(new { message = "Заказ не найден" });

            if (await _context.Reviews.AnyAsync(r => r.OrderId == id))
                return BadRequest(new { message = "Вы уже оставили отзыв к этому заказу" });

            var primaryProductId = order.Items.FirstOrDefault()?.ProductId ?? 1;

            var review = new Review
            {
                OrderId = id,
                UserId = userId,
                Rating = Math.Clamp(request.Rating, 1, 5),
                Comment = request.Comment,
                CreatedAt = DateTime.UtcNow
            };

            _context.Reviews.Add(review);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Спасибо за ваш отзыв!" });
        }

        [HttpGet("{id}/receipt")]
        public async Task<IActionResult> GetReceipt(int id)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var role = User.FindFirstValue(ClaimTypes.Role);

            var order = await _context.Orders
                .Include(o => o.User)
                .Include(o => o.Courier)
                .Include(o => o.Items)
                    .ThenInclude(i => i.Product)
                .FirstOrDefaultAsync(o => o.Id == id && (role == "admin" || o.UserId == userId));

            if (order == null) return NotFound(new { message = "Чек не найден" });

            return Ok(new
            {
                Company = new
                {
                    Name = "BiteGo («Быстрый Укус»)",
                    LegalName = "ООО «БайтГоу Доставка»",
                    Inn = "6440123456",
                    Ogrn = "1266400012345",
                    City = "г. Балашов, Саратовская область",
                    Address = "ул. Ленина, д. 18",
                    Phone = "+7 (800) 555-35-35",
                    SupportEmail = "support@bitego.ru"
                },
                OrderNumber = order.OrderNumber,
                Date = order.CreatedAt.ToString("dd.MM.yyyy HH:mm"),
                CustomerName = order.User.FullName,
                CustomerPhone = order.User.Phone,
                DeliveryAddress = order.DeliveryAddressText,
                CourierName = order.Courier?.FullName ?? "Курьер BiteGo",
                Items = order.Items.Select(i => new
                {
                    Name = i.Product.Name,
                    Quantity = i.Quantity,
                    Price = i.UnitPrice,
                    Total = i.TotalPrice,
                    Modifications = i.ExcludedIngredientsText != null || i.AddedAddonsText != null
                        ? $"{i.ExcludedIngredientsText} {i.AddedAddonsText}".Trim()
                        : null
                }),
                Subtotal = order.Subtotal,
                BonusPointsDiscount = order.BonusPointsUsed,
                DeliveryFee = order.DeliveryFee,
                TotalAmount = order.TotalAmount,
                PaymentMethod = order.PaymentMethod,
                PaymentStatus = order.PaymentStatus,
                BonusPointsEarned = order.BonusPointsEarned
            });
        }
    }

    public record CreateOrderDto(
        int? AddressId,
        string? DeliveryAddressText,
        string PaymentMethod,
        int BonusPointsToUse,
        string? CustomerNote,
        List<CreateOrderItemDto> Items
    );

    public record CreateOrderItemDto(
        int ProductId,
        int Quantity,
        List<string>? ExcludedIngredients,
        List<int>? AddonIds
    );

    public record ReportIssueDto(string? IssueType, string? Comment);
    public record ReviewDto(int Rating, string? Comment);
}
