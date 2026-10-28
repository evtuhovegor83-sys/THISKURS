using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BiteGo.Api.Models;

namespace BiteGo.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class MenuController : ControllerBase
    {
        private readonly BiteGoContext _context;

        public MenuController(BiteGoContext context)
        {
            _context = context;
        }

        [HttpGet("categories")]
        public async Task<IActionResult> GetCategories()
        {
            var categories = await _context.Categories
                .Where(c => c.IsActive)
                .OrderBy(c => c.SortOrder)
                .ToListAsync();
            return Ok(categories);
        }

        [HttpGet("products")]
        public async Task<IActionResult> GetProducts([FromQuery] int? categoryId, [FromQuery] string? search)
        {
            var query = _context.Products
                .Include(p => p.Category)
                .Where(p => p.IsActive);

            if (categoryId.HasValue && categoryId > 0)
                query = query.Where(p => p.CategoryId == categoryId);

            if (!string.IsNullOrWhiteSpace(search))
            {
                var searchLower = search.Trim().ToLower();
                query = query.Where(p => p.Name.ToLower().Contains(searchLower) || p.Description.ToLower().Contains(searchLower));
            }

            var products = await query.ToListAsync();

            // Получаем средний рейтинг и отзывы
            var reviews = await _context.Reviews.ToListAsync();
            var productIngredients = await _context.ProductIngredients
                .Include(pi => pi.Ingredient)
                .ToListAsync();

            var avgRating = reviews.Count != 0 ? Math.Round(reviews.Average(r => r.Rating), 1) : 4.9;

            var result = products.Select(p =>
            {
                var ingredients = productIngredients
                    .Where(pi => pi.ProductId == p.Id)
                    .Select(pi => pi.Ingredient.Name)
                    .ToList();

                return new
                {
                    p.Id,
                    p.CategoryId,
                    CategoryName = p.Category?.Name,
                    p.Name,
                    p.Description,
                    p.Price,
                    p.ImageUrl,
                    p.WeightGram,
                    p.CaloriesKcal,
                    p.CookingTimeMinutes,
                    p.StockQuantity,
                    IsAvailable = p.StockQuantity > 0,
                    Rating = avgRating,
                    ReviewsCount = reviews.Count,
                    IngredientsList = ingredients
                };
            }).ToList();

            return Ok(result);
        }

        [HttpGet("product/{id}")]
        public async Task<IActionResult> GetProductDetails(int id)
        {
            var product = await _context.Products
                .Include(p => p.Category)
                .FirstOrDefaultAsync(p => p.Id == id && p.IsActive);
            
            if (product == null) return NotFound(new { message = "Товар не найден" });

            var ingredients = await _context.ProductIngredients
                .Where(pi => pi.ProductId == id)
                .Include(pi => pi.Ingredient)
                .Select(pi => new
                {
                    pi.Ingredient.Id,
                    pi.Ingredient.Name,
                    pi.Ingredient.IsRemovable,
                    pi.IsDefault
                })
                .ToListAsync();

            var addons = await _context.Addons
                .Where(a => a.IsActive && (a.CategoryId == null || a.CategoryId == product.CategoryId))
                .OrderBy(a => a.Price)
                .Select(a => new
                {
                    a.Id,
                    a.Name,
                    a.Price
                })
                .ToListAsync();

            return Ok(new 
            { 
                product = new
                {
                    product.Id,
                    product.CategoryId,
                    CategoryName = product.Category?.Name,
                    product.Name,
                    product.Description,
                    product.Price,
                    product.ImageUrl,
                    product.WeightGram,
                    product.CaloriesKcal,
                    product.CookingTimeMinutes,
                    product.StockQuantity,
                    IsAvailable = product.StockQuantity > 0
                }, 
                ingredients,
                addons
            });
        }

        [HttpGet("addons")]
        public async Task<IActionResult> GetAddons()
        {
            var addons = await _context.Addons
                .Where(a => a.IsActive)
                .OrderBy(a => a.Price)
                .ToListAsync();
            return Ok(addons);
        }

        [HttpGet("reviews")]
        public async Task<IActionResult> GetPublicReviews()
        {
            var rawReviews = await _context.Reviews
                .Include(r => r.User)
                .Include(r => r.Order)
                    .ThenInclude(o => o.Items)
                        .ThenInclude(i => i.Product)
                .OrderByDescending(r => r.CreatedAt)
                .Take(12)
                .ToListAsync();

            var reviews = rawReviews.Select(r => new
            {
                r.Id,
                CustomerName = r.User != null ? r.User.FullName : "Гость BiteGo",
                r.Rating,
                r.Comment,
                CreatedAt = r.CreatedAt,
                OrderedDishes = r.Order != null 
                    ? r.Order.Items.Select(i => i.Product.Name).Distinct().Take(3).ToList() 
                    : new List<string>()
            }).ToList();

            var avgRating = reviews.Count != 0 ? Math.Round(reviews.Average(r => (double)r.Rating), 1) : 4.9;

            return Ok(new
            {
                averageRating = avgRating,
                totalCount = reviews.Count,
                reviews
            });
        }
    }
}
