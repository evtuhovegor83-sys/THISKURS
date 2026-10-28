using System.ComponentModel.DataAnnotations;

namespace BiteGo.Api.Models
{
    public class Order
    {
        public int Id { get; set; }
        public string OrderNumber { get; set; } = string.Empty;
        public int UserId { get; set; }
        public User User { get; set; } = null!;
        public int? AddressId { get; set; }
        public Address? Address { get; set; }
        public string DeliveryAddressText { get; set; } = string.Empty;
        public int? CourierId { get; set; }
        public Courier? Courier { get; set; }
        public int StatusId { get; set; }
        public Status Status { get; set; } = null!;
        public decimal Subtotal { get; set; }
        public int BonusPointsUsed { get; set; }
        public int BonusPointsEarned { get; set; }
        public decimal DeliveryFee { get; set; }
        public decimal TotalAmount { get; set; }
        public string PaymentMethod { get; set; } = string.Empty;
        public string PaymentStatus { get; set; } = string.Empty;
        public int EstimatedCookingMinutes { get; set; }
        public DateTime EstimatedDeliveryTime { get; set; }
        public string? CustomerNote { get; set; }
        public string? CancellationReason { get; set; }
        public string? IssueType { get; set; }
        public string? IssueComment { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? DeliveredAt { get; set; }
        public DateTime? CompletedAt { get; set; }
        [Timestamp]
        public byte[] RowVersion { get; set; } = null!;
        public ICollection<OrderItem> Items { get; set; } = new List<OrderItem>();
    }

    public class OrderItem
    {
        public int Id { get; set; }
        public int OrderId { get; set; }
        public Order Order { get; set; } = null!;
        public int ProductId { get; set; }
        public Product Product { get; set; } = null!;
        public int Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal ItemsPrice { get; set; }
        public decimal AddonsPrice { get; set; }
        public decimal TotalPrice { get; set; }
        public string? ExcludedIngredientsText { get; set; }
        public string? AddedAddonsText { get; set; }
        public ICollection<OrderItemAddon> Addons { get; set; } = new List<OrderItemAddon>();
    }

    public class OrderItemAddon
    {
        public int Id { get; set; }
        public int OrderItemId { get; set; }
        public OrderItem OrderItem { get; set; } = null!;
        public int AddonId { get; set; }
        public Addon Addon { get; set; } = null!;
        public string AddonName { get; set; } = string.Empty;
        public decimal Price { get; set; }
    }

    public class Payment
    {
        public int Id { get; set; }
        public int OrderId { get; set; }
        public Order Order { get; set; } = null!;
        public string PaymentMethod { get; set; } = string.Empty;
        public decimal Amount { get; set; }
        public string Status { get; set; } = string.Empty;
        public DateTime? PaidAt { get; set; }
        public string? TransactionRef { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class StockLog
    {
        public int Id { get; set; }
        public int ProductId { get; set; }
        public Product Product { get; set; } = null!;
        public string ChangeType { get; set; } = string.Empty;
        public int QuantityChange { get; set; }
        public int RemainingStock { get; set; }
        public decimal? CostPerUnit { get; set; }
        public string Reason { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public int? CreatedByUserId { get; set; }
        public User? CreatedByUser { get; set; }
    }

    public class Review
    {
        public int Id { get; set; }
        public int OrderId { get; set; }
        public Order Order { get; set; } = null!;
        public int UserId { get; set; }
        public User User { get; set; } = null!;
        public int Rating { get; set; }
        public string? Comment { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
