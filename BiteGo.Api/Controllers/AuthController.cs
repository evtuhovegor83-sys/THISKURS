using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using BiteGo.Api.Models;

namespace BiteGo.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly BiteGoContext _context;
        private readonly IConfiguration _config;

        public AuthController(BiteGoContext context, IConfiguration config)
        {
            _context = context;
            _config = config;
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Phone) || string.IsNullOrWhiteSpace(request.Password))
                return BadRequest(new { message = "Укажите номер телефона и пароль" });

            var cleanPhone = NormalizePhone(request.Phone);
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Phone == cleanPhone || u.Phone == request.Phone);
            if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
                return Unauthorized(new { message = "Неверный номер телефона или пароль" });

            var token = GenerateToken(user);
            return Ok(new 
            { 
                token, 
                user = new 
                { 
                    user.Id, 
                    user.FullName, 
                    user.Phone, 
                    user.Email, 
                    user.Role, 
                    user.BonusPoints 
                } 
            });
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Phone) || string.IsNullOrWhiteSpace(request.Password) || string.IsNullOrWhiteSpace(request.FullName))
                return BadRequest(new { message = "Заполните все обязательные поля (ФИО, телефон, пароль)" });

            var cleanPhone = NormalizePhone(request.Phone);
            if (await _context.Users.AnyAsync(u => u.Phone == cleanPhone))
                return BadRequest(new { message = "Пользователь с таким номером телефона уже зарегистрирован" });

            var newUser = new User
            {
                FullName = request.FullName.Trim(),
                Phone = cleanPhone,
                Email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim(),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password, 11),
                Role = "customer",
                BonusPoints = 100, // Приветственные 100 бонусов новому клиенту!
                CreatedAt = DateTime.UtcNow
            };

            _context.Users.Add(newUser);
            await _context.SaveChangesAsync();

            var token = GenerateToken(newUser);
            return Ok(new 
            { 
                token, 
                user = new 
                { 
                    newUser.Id, 
                    newUser.FullName, 
                    newUser.Phone, 
                    newUser.Email, 
                    newUser.Role, 
                    newUser.BonusPoints 
                } 
            });
        }

        [Authorize]
        [HttpGet("me")]
        public async Task<IActionResult> GetProfile()
        {
            var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!int.TryParse(userIdStr, out var userId))
                return Unauthorized();

            var user = await _context.Users.FindAsync(userId);
            if (user == null) return NotFound();

            var savedAddresses = await _context.Addresses
                .Where(a => a.UserId == userId)
                .OrderByDescending(a => a.IsDefault)
                .ThenByDescending(a => a.CreatedAt)
                .ToListAsync();

            return Ok(new
            {
                user.Id,
                user.FullName,
                user.Phone,
                user.Email,
                user.Role,
                user.BonusPoints,
                addresses = savedAddresses
            });
        }

        [HttpGet("demo-accounts")]
        public IActionResult GetDemoAccounts()
        {
            if (!_config.GetValue<bool>("DemoMode")) return NotFound();
            return Ok(new[] {
                new { role = "admin", name = "Оператор (Администратор)", phone = "+79990000001", password = "admin123" },
                new { role = "customer", name = "Иван Смирнов (350 бонусов)", phone = "+79991112233", password = "user123" },
                new { role = "customer", name = "Анна Кузнецова (120 бонусов)", phone = "+79992223344", password = "user123" }
            });
        }

        private static string NormalizePhone(string phone)
        {
            var digits = new string(phone.Where(char.IsDigit).ToArray());
            if (digits.Length == 11 && (digits.StartsWith("7") || digits.StartsWith("8")))
                return "+7" + digits.Substring(1);
            if (digits.Length == 10)
                return "+7" + digits;
            return phone;
        }

        private string GenerateToken(User user)
        {
            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.FullName),
                new Claim(ClaimTypes.Role, user.Role)
            };

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                _config["Jwt:Issuer"],
                _config["Jwt:Audience"],
                claims,
                expires: DateTime.UtcNow.AddDays(7),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }

    public record LoginRequest(string Phone, string Password);
    public record RegisterRequest(string FullName, string Phone, string? Email, string Password);
}
