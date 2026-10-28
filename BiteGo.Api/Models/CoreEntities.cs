using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BiteGo.Api.Models
{
    public class Category
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Icon { get; set; } = string.Empty;
        public int SortOrder { get; set; }
        public bool IsActive { get; set; }
        public ICollection<Product> Products { get; set; } = new List<Product>();
    }

    public class Ingredient
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public bool IsRemovable { get; set; }
    }

    public class ProductIngredient
    {
        public int ProductId { get; set; }
        public Product Product { get; set; } = null!;
        public int IngredientId { get; set; }
        public Ingredient Ingredient { get; set; } = null!;
        public bool IsDefault { get; set; }
    }

    public class Addon
    {
        public int Id { get; set; }
        public int? CategoryId { get; set; }
        public string Name { get; set; } = string.Empty;
        public decimal Price { get; set; }
        public bool IsActive { get; set; }
    }

    public class LocalStreet
    {
        public int Id { get; set; }
        public string City { get; set; } = "Балашов";
        public string StreetName { get; set; } = string.Empty;
        public int PopularityRank { get; set; }
    }
}
