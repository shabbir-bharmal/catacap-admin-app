using Invest.Core.Constants;
using Invest.Core.Dtos;
using Invest.Core.Models;
using Invest.Core.Settings;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Invest.Controllers
{
    [Route("api/form-submission")]
    [ApiController]
    public class FormSubmissionsController : ControllerBase
    {
        private readonly RepositoryContext _context;
        private readonly AppSecrets _appSecrets;
        private readonly HttpClient _httpClient;

        public FormSubmissionsController(RepositoryContext context, AppSecrets appSecrets, HttpClient httpClient)
        {
            _context = context;
            _appSecrets = appSecrets;
            _httpClient = httpClient;
        }

        [HttpPost]
        public async Task<IActionResult> Submit(SubmitFormDto dto)
        {
            if (!string.IsNullOrEmpty(dto.CaptchaToken) && !await VerifyCaptcha(dto.CaptchaToken))
                return Ok(new { Success = false, Message = "CAPTCHA verification failed." });

            List<int> interestIds = new List<int>();

            if (!string.IsNullOrWhiteSpace(dto.Description) && dto.FormType == FormType.About)
            {
                var interests = dto.Description.Split(',', StringSplitOptions.RemoveEmptyEntries)
                                               .Select(x => x.Trim())
                                               .ToList();

                foreach (var interest in interests)
                {
                    if (int.TryParse(interest, out int id))
                    {
                        interestIds.Add(id);
                    }
                    else
                    {
                        var existingConfig = await _context.SiteConfiguration
                                            .FirstOrDefaultAsync(x => x.Type == "Interest"
                                            && x.Key.ToLower() == interest.ToLower());

                        if (existingConfig != null)
                        {
                            interestIds.Add(existingConfig.Id);
                        }
                        else
                        {
                            var newConfig = new SiteConfiguration
                            {
                                Key = interest,
                                Value = interest,
                                Type = $"{SiteConfigurationType.Interest}-other"
                            };

                            _context.SiteConfiguration.Add(newConfig);
                            await _context.SaveChangesAsync();

                            interestIds.Add(newConfig.Id);
                        }
                    }
                }
            }

            var form = new FormSubmission
            {
                FormType = dto.FormType,
                FirstName = dto.FirstName,
                LastName = dto.LastName,
                Email = dto.Email,
                Status = FormSubmissionStatus.New,
                Description = dto.FormType == FormType.About
                                ? interestIds.Any() ? string.Join(",", interestIds) : null :
                              dto.Description!.Trim(),
                LaunchPartners = !string.IsNullOrWhiteSpace(dto.LaunchPartners) ? dto.LaunchPartners : null,
                TargetRaiseAmount = !string.IsNullOrWhiteSpace(dto.TargetRaiseAmount) ? dto.TargetRaiseAmount : null,
                SelfRaiseAmountRange = !string.IsNullOrWhiteSpace(dto.SelfRaiseAmountRange) ? dto.SelfRaiseAmountRange : null,
                CreatedAt = DateTime.Now
            };

            _context.FormSubmission.Add(form);
            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Your data has been submitted successfully." });
        }

        [HttpGet]
        public async Task<object> GetInterest()
        {
            var data = await _context.SiteConfiguration
                                     .Where(t => t.Type == SiteConfigurationType.Interest)
                                     .OrderBy(t => t.Value)
                                     .Select(t => new
                                     {
                                         t.Id,
                                         t.Value
                                     })
                                     .ToListAsync();

            return data;
        }

        private async Task<bool> VerifyCaptcha(string token)
        {
            var requestContent = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("secret", _appSecrets.CaptchaSecretKey),
                new KeyValuePair<string, string>("response", token)
            });

            var response = await _httpClient.PostAsync("https://hcaptcha.com/siteverify", requestContent);

            var content = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(content);
            bool isSuccess = doc.RootElement.GetProperty("success").GetBoolean();

            return isSuccess;
        }
    }
}
