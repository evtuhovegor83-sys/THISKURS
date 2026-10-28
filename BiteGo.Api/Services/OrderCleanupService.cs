using BiteGo.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BiteGo.Api.Services
{
    public class OrderCleanupService : BackgroundService
    {
        private readonly IServiceProvider _services;
        private readonly ILogger<OrderCleanupService> _logger;

        public OrderCleanupService(IServiceProvider services, ILogger<OrderCleanupService> logger)
        {
            _services = services;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Фоновая служба автоотмены заказов BiteGo запущена.");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _services.CreateScope();
                    var context = scope.ServiceProvider.GetRequiredService<BiteGoContext>();

                    // Ищем заказы в статусе 1 (Новый), висящие без подтверждения более 30 минут
                    var expiredThreshold = DateTime.UtcNow.AddMinutes(-30);

                    var oldOrders = await context.Orders
                        .Include(o => o.Items)
                        .Where(o => o.StatusId == 1 && o.CreatedAt < expiredThreshold)
                        .ToListAsync(stoppingToken);

                    if (oldOrders.Count > 0)
                    {
                        foreach (var order in oldOrders)
                        {
                            order.StatusId = 7; // 7 = Отменен
                            order.CancellationReason = "Автоотмена: заказ не был подтвержден кухней в течение 30 минут";

                            // Возвращаем зарезервированные блюда обратно на склад
                            foreach (var item in order.Items)
                            {
                                var product = await context.Products.FindAsync(item.ProductId);
                                if (product != null)
                                {
                                    product.StockQuantity += item.Quantity;

                                    context.StockLogs.Add(new StockLog
                                    {
                                        ProductId = product.Id,
                                        ChangeType = "Возврат (автоотмена)",
                                        QuantityChange = item.Quantity,
                                        RemainingStock = product.StockQuantity,
                                        Reason = $"Автоматический возврат по отмененному заказу {order.OrderNumber}",
                                        CreatedAt = DateTime.UtcNow
                                    });
                                }
                            }

                            // Возвращаем списанные баллы клиенту
                            if (order.BonusPointsUsed > 0)
                            {
                                var customer = await context.Users.FindAsync(order.UserId);
                                if (customer != null)
                                {
                                    customer.BonusPoints += order.BonusPointsUsed;
                                }
                            }
                        }

                        await context.SaveChangesAsync(stoppingToken);
                        _logger.LogInformation("Автоотмена выполнена для {Count} заказов. Товары и баллы возвращены.", oldOrders.Count);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Ошибка при выполнении фоновой службы автоотмены заказов.");
                }

                // Проверяем каждую минуту
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
    }
}
