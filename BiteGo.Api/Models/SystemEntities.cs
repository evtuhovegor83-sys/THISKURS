using System.ComponentModel.DataAnnotations;

namespace BiteGo.Api.Models
{
    public class Address
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public User User { get; set; } = null!;
        public string City { get; set; } = "Балашов";
        public string Street { get; set; } = string.Empty;
        public string House { get; set; } = string.Empty;
        public string? Apartment { get; set; }
        public string? Entrance { get; set; }
        public string? Floor { get; set; }
        public string? Intercom { get; set; }
        public string? Comment { get; set; }
        public bool IsDefault { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class Courier
    {
        public int Id { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;
        public string PhotoUrl { get; set; } = string.Empty;
        public string Status { get; set; } = "Свободен";
        public decimal DeliveryRate { get; set; }
        public int TotalDeliveriesCount { get; set; }
        [Timestamp]
        public byte[] RowVersion { get; set; } = null!;
    }

    public class Status
    {
        public int Id { get; set; }
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public int SortOrder { get; set; }
    }
}
