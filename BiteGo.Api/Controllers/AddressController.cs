using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.Json;
using BiteGo.Api.Models;

namespace BiteGo.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AddressController : ControllerBase
    {
        private readonly BiteGoContext _context;
        private readonly IConfiguration _config;
        private readonly IHttpClientFactory _httpClientFactory;

        public AddressController(BiteGoContext context, IConfiguration config, IHttpClientFactory httpClientFactory)
        {
            _context = context;
            _config = config;
            _httpClientFactory = httpClientFactory;
        }

        [HttpGet("suggest")]
        public async Task<IActionResult> SuggestAddress([FromQuery] string query, [FromQuery] string? city = "Балашов")
        {
            if (string.IsNullOrWhiteSpace(query) || query.Trim().Length < 2)
                return Ok(Array.Empty<object>());

            var q = query.Trim();
            var targetCity = !string.IsNullOrWhiteSpace(city) ? city.Trim() : "Балашов";
            var apiKey = _config["DaData:ApiKey"];

            // 1. Попытка вызвать DaData API, если ключ настроен в appsettings.json
            if (!string.IsNullOrWhiteSpace(apiKey))
            {
                try
                {
                    var client = _httpClientFactory.CreateClient();
                    client.DefaultRequestHeaders.Add("Authorization", $"Token {apiKey}");
                    client.DefaultRequestHeaders.Add("Accept", "application/json");

                    var body = new
                    {
                        query = $"{targetCity} {q}",
                        count = 6,
                        locations = new[] { new { city = targetCity } }
                    };

                    var response = await client.PostAsJsonAsync("https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address", body);
                    if (response.IsSuccessStatusCode)
                    {
                        var json = await response.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(json);
                        var suggestions = doc.RootElement.GetProperty("suggestions");
                        var list = new List<object>();

                        foreach (var item in suggestions.EnumerateArray())
                        {
                            var val = item.GetProperty("value").GetString() ?? "";
                            string? street = null;
                            string? house = null;

                            if (item.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Object)
                            {
                                if (data.TryGetProperty("street_with_type", out var swt) && swt.ValueKind == JsonValueKind.String)
                                    street = swt.GetString();
                                else if (data.TryGetProperty("street", out var s) && s.ValueKind == JsonValueKind.String)
                                    street = s.GetString();

                                if (data.TryGetProperty("house", out var h) && h.ValueKind == JsonValueKind.String)
                                    house = h.GetString();
                            }

                            var displayValue = val
                                .Replace("Саратовская обл, ", "")
                                .Replace($"г {targetCity}, ", "")
                                .Replace($"г. {targetCity}, ", "")
                                .Trim();

                            list.Add(new
                            {
                                value = displayValue,
                                fullValue = val,
                                street = !string.IsNullOrWhiteSpace(street) ? street : displayValue,
                                house = house ?? "",
                                source = "DaData API"
                            });
                        }

                        if (list.Count > 0)
                            return Ok(list);
                    }
                }
                catch
                {
                    // Fallback to local database upon network/API failure
                }
            }

            // 2. Локальный Fallback (оффлайн справочник популярных улиц)
            var localStreets = await _context.LocalStreets
                .Where(s => s.StreetName.ToLower().Contains(q.ToLower()))
                .OrderByDescending(s => s.PopularityRank)
                .Take(5)
                .Select(s => new
                {
                    value = s.StreetName,
                    fullValue = $"г. {targetCity}, {s.StreetName}",
                    street = s.StreetName,
                    house = "",
                    source = $"Справочник ({targetCity})"
                })
                .ToListAsync();

            return Ok(localStreets);
        }

        [HttpGet("cities")]
        public async Task<IActionResult> SearchCities([FromQuery] string? query)
        {
            var popularCities = new[]
            {
                new { city = "Балашов", region = "Саратовская обл.", displayName = "г. Балашов (Саратовская обл.)" },
                new { city = "Саратов", region = "Саратовская обл.", displayName = "г. Саратов" },
                new { city = "Москва", region = "г. Москва", displayName = "г. Москва" },
                new { city = "Санкт-Петербург", region = "г. Санкт-Петербург", displayName = "г. Санкт-Петербург" },
                new { city = "Энгельс", region = "Саратовская обл.", displayName = "г. Энгельс" },
                new { city = "Самара", region = "Самарская обл.", displayName = "г. Самара" },
                new { city = "Воронеж", region = "Воронежская обл.", displayName = "г. Воронеж" },
                new { city = "Казань", region = "респ. Татарстан", displayName = "г. Казань" },
                new { city = "Волгоград", region = "Волгоградская обл.", displayName = "г. Волгоград" },
                new { city = "Ртищево", region = "Саратовская обл.", displayName = "г. Ртищево" }
            };

            if (string.IsNullOrWhiteSpace(query))
                return Ok(popularCities);

            var q = query.Trim();
            var apiKey = _config["DaData:ApiKey"];

            if (!string.IsNullOrWhiteSpace(apiKey))
            {
                try
                {
                    var client = _httpClientFactory.CreateClient();
                    client.DefaultRequestHeaders.Add("Authorization", $"Token {apiKey}");
                    client.DefaultRequestHeaders.Add("Accept", "application/json");

                    var body = new
                    {
                        query = q,
                        count = 10,
                        from_bound = new { value = "city" },
                        to_bound = new { value = "settlement" }
                    };

                    var response = await client.PostAsJsonAsync("https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address", body);
                    if (response.IsSuccessStatusCode)
                    {
                        var json = await response.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(json);
                        var suggestions = doc.RootElement.GetProperty("suggestions");
                        var list = new List<object>();

                        foreach (var item in suggestions.EnumerateArray())
                        {
                            var val = item.GetProperty("value").GetString() ?? "";
                            string city = "";
                            string region = "";

                            if (item.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Object)
                            {
                                if (data.TryGetProperty("city", out var c) && c.ValueKind == JsonValueKind.String)
                                    city = c.GetString() ?? "";
                                else if (data.TryGetProperty("settlement", out var s) && s.ValueKind == JsonValueKind.String)
                                    city = s.GetString() ?? "";

                                if (data.TryGetProperty("region_with_type", out var r) && r.ValueKind == JsonValueKind.String)
                                    region = r.GetString() ?? "";
                            }

                            if (string.IsNullOrWhiteSpace(city))
                                city = val;

                            var displayName = !string.IsNullOrWhiteSpace(region) && !val.Contains(region)
                                ? $"{val} ({region})"
                                : val;

                            list.Add(new
                            {
                                city,
                                region,
                                displayName
                            });
                        }

                        if (list.Count > 0)
                            return Ok(list);
                    }
                }
                catch
                {
                    // Fallback to local filtering
                }
            }

            var filtered = popularCities
                .Where(c => c.city.ToLower().Contains(q.ToLower()) || c.displayName.ToLower().Contains(q.ToLower()))
                .ToList();

            return Ok(filtered);
        }

        [Authorize]
        [HttpGet]
        public async Task<IActionResult> GetUserAddresses()
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var addresses = await _context.Addresses
                .Where(a => a.UserId == userId)
                .OrderByDescending(a => a.IsDefault)
                .ThenByDescending(a => a.CreatedAt)
                .ToListAsync();
            return Ok(addresses);
        }

        [Authorize]
        [HttpPost]
        public async Task<IActionResult> SaveAddress([FromBody] SaveAddressRequest request)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            if (string.IsNullOrWhiteSpace(request.Street) || string.IsNullOrWhiteSpace(request.House))
                return BadRequest(new { message = "Укажите улицу и номер дома" });

            if (request.IsDefault)
            {
                var existing = await _context.Addresses.Where(a => a.UserId == userId).ToListAsync();
                foreach (var a in existing) a.IsDefault = false;
            }

            var address = new Address
            {
                UserId = userId,
                City = "Балашов",
                Street = request.Street.Trim(),
                House = request.House.Trim(),
                Apartment = request.Apartment?.Trim(),
                Entrance = request.Entrance?.Trim(),
                Floor = request.Floor?.Trim(),
                Intercom = request.Intercom?.Trim(),
                Comment = request.Comment?.Trim(),
                IsDefault = request.IsDefault,
                CreatedAt = DateTime.UtcNow
            };

            _context.Addresses.Add(address);
            await _context.SaveChangesAsync();
            return Ok(address);
        }
    }

    public record SaveAddressRequest(
        string Street, 
        string House, 
        string? Apartment, 
        string? Entrance, 
        string? Floor, 
        string? Intercom, 
        string? Comment, 
        bool IsDefault
    );
}
