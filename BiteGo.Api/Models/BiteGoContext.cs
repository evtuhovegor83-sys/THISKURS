using Microsoft.EntityFrameworkCore;

namespace BiteGo.Api.Models
{
    public class BiteGoContext : DbContext
    {
        public BiteGoContext(DbContextOptions<BiteGoContext> options) : base(options) { }

        public DbSet<User> Users { get; set; }
        public DbSet<Category> Categories { get; set; }
        public DbSet<Product> Products { get; set; }
        public DbSet<Ingredient> Ingredients { get; set; }
        public DbSet<ProductIngredient> ProductIngredients { get; set; }
        public DbSet<Addon> Addons { get; set; }
        public DbSet<Address> Addresses { get; set; }
        public DbSet<Courier> Couriers { get; set; }
        public DbSet<Status> Statuses { get; set; }
        public DbSet<Order> Orders { get; set; }
        public DbSet<OrderItem> OrderItems { get; set; }
        public DbSet<OrderItemAddon> OrderItemAddons { get; set; }
        public DbSet<Payment> Payments { get; set; }
        public DbSet<StockLog> StockLogs { get; set; }
        public DbSet<Review> Reviews { get; set; }
        public DbSet<LocalStreet> LocalStreets { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Явное сопоставление таблиц
            modelBuilder.Entity<StockLog>().ToTable("StockLog");
            modelBuilder.Entity<LocalStreet>().ToTable("LocalStreets");

            modelBuilder.Entity<ProductIngredient>()
                .HasKey(pi => new { pi.ProductId, pi.IngredientId });

            modelBuilder.Entity<Product>()
                .Property(p => p.RowVersion)
                .IsRowVersion();

            modelBuilder.Entity<Courier>()
                .Property(c => c.RowVersion)
                .IsRowVersion();

            modelBuilder.Entity<Order>()
                .Property(o => o.RowVersion)
                .IsRowVersion();

            // Точные типы decimal для SQL Server
            modelBuilder.Entity<Product>().Property(p => p.Price).HasPrecision(10, 2);
            modelBuilder.Entity<Addon>().Property(a => a.Price).HasPrecision(10, 2);
            modelBuilder.Entity<Courier>().Property(c => c.DeliveryRate).HasPrecision(10, 2);
            modelBuilder.Entity<Order>().Property(o => o.Subtotal).HasPrecision(10, 2);
            modelBuilder.Entity<Order>().Property(o => o.TotalAmount).HasPrecision(10, 2);
            modelBuilder.Entity<Order>().Property(o => o.DeliveryFee).HasPrecision(10, 2);
            modelBuilder.Entity<OrderItem>().Property(i => i.UnitPrice).HasPrecision(10, 2);
            modelBuilder.Entity<OrderItem>().Property(i => i.ItemsPrice).HasPrecision(10, 2);
            modelBuilder.Entity<OrderItem>().Property(i => i.AddonsPrice).HasPrecision(10, 2);
            modelBuilder.Entity<OrderItem>().Property(i => i.TotalPrice).HasPrecision(10, 2);
            modelBuilder.Entity<OrderItemAddon>().Property(a => a.Price).HasPrecision(10, 2);
            modelBuilder.Entity<Payment>().Property(p => p.Amount).HasPrecision(10, 2);
            modelBuilder.Entity<StockLog>().Property(s => s.CostPerUnit).HasPrecision(10, 2);
        }
    }
}
