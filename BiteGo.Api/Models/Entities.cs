using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BiteGo.Api.Models
{
    public class User
    {
        public int Id { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;
        public string? Email { get; set; }
        public string PasswordHash { get; set; } = string.Empty;
        public string Role { get; set; } = "customer"; // 'customer' or 'admin'
        public int BonusPoints { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class Product
    {
        public int Id { get; set; }
        public int CategoryId { get; set; }
        public Category? Category { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public decimal Price { get; set; }
        public string ImageUrl { get; set; } = string.Empty;
        public int WeightGram { get; set; }
        public int CaloriesKcal { get; set; }
        public int CookingTimeMinutes { get; set; }
        public int StockQuantity { get; set; }
        public bool IsActive { get; set; }
        
        [Timestamp]
        public byte[] RowVersion { get; set; } = null!;
    }
}
