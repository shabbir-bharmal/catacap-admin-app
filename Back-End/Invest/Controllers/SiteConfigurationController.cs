using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Specialized;
using Invest.Core.Constants;
using Invest.Core.Dtos;
using Invest.Core.Models;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Linq.Expressions;

namespace Invest.Controllers
{
    [Route("api/[controller]")]
    public class SiteConfigurationController : ControllerBase
    {
        private readonly RepositoryContext _context;
        private readonly BlobContainerClient _blobContainerClient;

        public SiteConfigurationController(RepositoryContext context, BlobContainerClient blobContainerClient)
        {
            _context = context;
            _blobContainerClient = blobContainerClient;
        }

        [HttpPost("site-configuration")]
        public async Task<IActionResult> CreateOrUpdate([FromBody] SiteConfigurationDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Type))
                return BadRequest("Type is required.");

            var result = (dto.Id.HasValue && dto.Id > 0)
                            ? await UpdateByTypeAsync(dto)
                            : await CreateByTypeAsync(dto);

            return Ok(new { result.Success, result.Message });
        }

        [HttpGet("site-configuration")]
        public async Task<object> GetAll(string type)
        {
            switch (type.ToLower().Trim())
            {
                case "investment-terms":

                    return await _context.SiteConfiguration
                                         .Where(x => x.Type == SiteConfigurationType.StaticValue)
                                         .OrderBy(x => x.Key)
                                         .Select(x => new
                                         {
                                             x.Id,
                                             x.Key,
                                             x.Value
                                         })
                                         .ToListAsync();

                case "sourcedby":

                    return await _context.ApprovedBy
                                         .OrderBy(x => x.Name)
                                         .Select(x => new
                                         {
                                             x.Id,
                                             Value = x.Name
                                         })
                                         .ToListAsync();

                case "themes":

                    return await _context.Themes
                                         .OrderBy(x => x.Name)
                                         .Select(x => new
                                         {
                                             x.Id,
                                             Value = x.Name,
                                             x.ImageFileName
                                         })
                                         .ToListAsync();

                case "special-filters":

                    return await _context.InvestmentTag
                                         .OrderBy(x => x.Tag)
                                         .Select(x => new
                                         {
                                             x.Id,
                                             Value = x.Tag
                                         })
                                         .ToListAsync();

                case "transaction-type":

                    return await _context.SiteConfiguration
                                         .Where(t => t.Type == SiteConfigurationType.TransactionType)
                                         .OrderBy(t => t.Value)
                                         .Select(t => new
                                         {
                                             t.Id,
                                             t.Value
                                         })
                                         .ToListAsync();

                case "statistics":

                    return await _context.SiteConfiguration
                                         .Where(t => t.Type.Contains(SiteConfigurationType.Statistics))
                                         .OrderBy(t => t.Value)
                                         .Select(t => new
                                         {
                                             t.Id,
                                             t.Key,
                                             t.Value,
                                             Type = t.Type.Replace("Statistics-", "")
                                         })
                                         .ToListAsync();

                case "meta-information":

                    return await _context.SiteConfiguration
                                         .Where(t => t.Type.Contains(SiteConfigurationType.MetaInformation))
                                         .OrderBy(x => x.Key)
                                         .Select(x => new
                                         {
                                             x.Id,
                                             x.Key,
                                             x.Value,
                                             x.Image,
                                             x.ImageName,
                                             x.AdditionalDetails
                                         })
                                         .ToListAsync();

                default:
                    return new List<object>();
            }
        }

        [HttpDelete("site-configuration")]
        public async Task<IActionResult> Delete(string type, int id)
        {
            if (string.IsNullOrWhiteSpace(type))
                return BadRequest("Type is required.");

            var result = type.ToLower().Trim() switch
            {
                "investment-terms" => await DeleteMasterAsync<SiteConfiguration>(
                    id,
                    x => x.Type == SiteConfigurationType.StaticValue,
                    async entity => await _context.Campaigns.AnyAsync(c => ("{" + c.Terms + "}").Contains(entity.Key)),
                    "Cannot delete this term, it’s being used in investments.",
                    "Configuration deleted successfully."
                ),

                "sourcedby" => await DeleteMasterAsync<ApprovedBy>(
                    id,
                    null,
                    async entity => await _context.Campaigns.AnyAsync(c => ("," + c.ApprovedBy + ",").Contains("," + entity.Id + ",")),
                    "Cannot delete this sourced by, it’s being used in investments.",
                    "Sourced by deleted successfully."
                ),

                "themes" => await DeleteMasterAsync<Theme>(
                    id,
                    null,
                    async entity => await _context.Campaigns.AnyAsync(c => ("," + c.Themes + ",").Contains("," + entity.Id + ",")),
                    "Cannot delete this theme, it’s being used in investments.",
                    "Theme deleted successfully."
                ),

                "special-filters" => await DeleteMasterAsync<InvestmentTag>(
                    id,
                    null,
                    async entity => await _context.InvestmentTagMapping.AnyAsync(x => x.TagId == entity.Id),
                    "Cannot delete this special filter, it’s being used in investments.",
                    "Special filter deleted successfully."
                ),

                "transaction-type" => await DeleteMasterAsync<SiteConfiguration>(
                    id,
                    x => x.Type == SiteConfigurationType.TransactionType,
                    async entity => await _context.CompletedInvestmentsDetails.AnyAsync(x => x.SiteConfigurationId == entity.Id),
                    "Cannot delete this transaction type, it’s being used in investments.",
                    "Transaction type deleted successfully."
                ),

                _ => (Success : false, Message : "Invalid configuration type.")
            };

            return Ok(new { result.Success, result.Message });
        }

        [HttpGet("investment")]
        public async Task<IActionResult> GetAllInvestment(string configurationType, int configurationId)
        {
            if (string.IsNullOrWhiteSpace(configurationType))
                return BadRequest("Type is required.");

            if (configurationId <= 0)
                return BadRequest("Id must be greater than zero.");

            configurationType = configurationType.ToLower();

            var result = await _context.Campaigns
                                       .Select(c => new
                                       {
                                           c.Id,
                                           c.Name,
                                           IsSelected =
                                               configurationType == "specialfilters"
                                                   ? _context.InvestmentTagMapping
                                                       .Any(m => m.CampaignId == c.Id && m.TagId == configurationId)
                                                   : configurationType == "themes"
                                                       ? ("," + (c.Themes ?? "") + ",").Contains("," + configurationId + ",")
                                                       : configurationType == "sourcedby"
                                                           ? ("," + (c.ApprovedBy ?? "") + ",").Contains("," + configurationId + ",")
                                                           : configurationType == "sdgs"
                                                               ? ("," + (c.SDGs ?? "") + ",").Contains("," + configurationId + ",")
                                                               : false
                                       })
                                       .OrderBy(c => c.Name)
                                       .ToListAsync();

            return Ok(result);
        }

        [HttpPost("update-investment-mapping")]
        public async Task<IActionResult> UpdateInvestment(string configurationType, int configurationId, int investmentId)
        {
            if (string.IsNullOrWhiteSpace(configurationType))
                return BadRequest(new { success = false, message = "Type is required." });

            if (configurationId <= 0 || investmentId <= 0)
                return BadRequest(new { success = false, message = "Invalid id." });

            configurationType = configurationType.ToLower();
            bool isAdded;

            if (configurationType == "specialfilters")
            {
                var mapping = await _context.InvestmentTagMapping
                                            .FirstOrDefaultAsync(x =>
                                                x.CampaignId == investmentId &&
                                                x.TagId == configurationId);

                if (mapping != null)
                {
                    _context.InvestmentTagMapping.Remove(mapping);
                    isAdded = false;
                }
                else
                {
                    _context.InvestmentTagMapping.Add(new InvestmentTagMapping
                    {
                        CampaignId = investmentId,
                        TagId = configurationId
                    });
                    isAdded = true;
                }
            }
            else
            {
                var campaign = await _context.Campaigns.FirstOrDefaultAsync(x => x.Id == investmentId);
                if (campaign == null)
                    return NotFound(new { success = false, message = "Campaign not found." });

                var column = GetColumnValue(campaign, configurationType);
                var list = string.IsNullOrWhiteSpace(column)
                            ? new List<int>()
                            : column
                                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                .Select(int.Parse)
                                .ToList();

                if (list.Contains(configurationId))
                {
                    list.Remove(configurationId);
                    isAdded = false;
                }
                else
                {
                    list.Add(configurationId);
                    isAdded = true;
                }

                SetColumnValue(campaign, configurationType, list.Any() ? string.Join(",", list) : null);
            }

            await _context.SaveChangesAsync();

            return Ok(new
            {
                Success = true,
                Message = isAdded ? "Investment mapping added successfully." : "Investment mapping removed successfully."
            });
        }

        private async Task<(bool Success, string Message)> CreateByTypeAsync(SiteConfigurationDto dto)
        {
            var type = dto.Type.ToLower().Trim();

            switch (type)
            {
                case "investment-terms":

                    if (string.IsNullOrWhiteSpace(dto.Key))
                        return (false, "Key is required.");

                    if (string.IsNullOrWhiteSpace(dto.Value))
                        return (false, "Value is required.");

                    var staticEntity = new SiteConfiguration
                    {
                        Key = dto.Key.Trim(),
                        Value = dto.Value.Trim(),
                        Type = SiteConfigurationType.StaticValue
                    };

                    return await CreateMasterAsync(
                        _context.SiteConfiguration.Where(x => x.Type == SiteConfigurationType.StaticValue),
                        staticEntity,
                        x => x.Key,
                        "Entered key already exists.",
                        "Configuration created successfully."
                    );

                case "sourcedby":

                    if (string.IsNullOrWhiteSpace(dto.Value))
                        return (false, "Sourced by is required.");

                    var sourcedEntity = new ApprovedBy
                    {
                        Name = dto.Value.Trim()
                    };

                    return await CreateMasterAsync(
                        _context.ApprovedBy,
                        sourcedEntity,
                        x => x.Name,
                        "Entered sourced by value already exists.",
                        "Sourced by created successfully."
                    );

                case "themes":

                    if (string.IsNullOrWhiteSpace(dto.Value))
                        return (false, "Theme is required.");

                    if (string.IsNullOrWhiteSpace(dto.Image))
                        return (false, "Image is required.");

                    string fileName = await UploadBase64File(dto.Image);

                    var themeEntity = new Theme
                    {
                        Name = dto.Value.Trim(),
                        ImageFileName = fileName
                    };

                    return await CreateMasterAsync(
                        _context.Themes,
                        themeEntity,
                        x => x.Name,
                        "Entered theme value already exists.",
                        "Theme created successfully."
                    );

                case "special-filters":

                    if (string.IsNullOrWhiteSpace(dto.Value))
                        return (false, "Tag is required.");

                    var tagEntity = new InvestmentTag
                    {
                        Tag = dto.Value.Trim()
                    };

                    return await CreateMasterAsync(
                        _context.InvestmentTag,
                        tagEntity,
                        x => x.Tag,
                        "Entered tag value already exists.",
                        "Special filter created successfully."
                    );

                case "transaction-type":

                    if (string.IsNullOrWhiteSpace(dto.Value))
                        return (false, "Transaction type is required.");

                    var transactiontypeEntity = new SiteConfiguration
                    {
                        Key = dto.Value.Trim(),
                        Value = dto.Value.Trim(),
                        Type = SiteConfigurationType.TransactionType
                    };

                    return await CreateMasterAsync(
                        _context.SiteConfiguration.Where(x => x.Type == SiteConfigurationType.TransactionType),
                        transactiontypeEntity,
                        x => x.Value,
                        "Entered transaction type value already exists.",
                        "Transaction type created successfully."
                    );

                default:
                    return (false, "Invalid configuration type.");
            }
        }

        private async Task<(bool Success, string Message)> UpdateByTypeAsync(SiteConfigurationDto dto)
        {
            var type = dto.Type.ToLower().Trim();

            switch (type)
            {
                case "investment-terms":

                    if (string.IsNullOrWhiteSpace(dto.Key))
                        return (false, "Key is required.");

                    if (string.IsNullOrWhiteSpace(dto.Value))
                        return (false, "Value is required.");

                    return await UpdateMasterAsync(
                        _context.SiteConfiguration.Where(x => x.Type == SiteConfigurationType.StaticValue),
                        dto.Id!.Value,
                        x => x.Key,
                        (e, val, img) =>
                        {
                            e.Key = dto.Key!.Trim();
                            e.Value = dto.Value!.Trim();
                        },
                        dto.Key,
                        null,
                        "Entered key already exists.",
                        "Configuration updated successfully."
                    );

                case "sourcedby":

                    if (string.IsNullOrWhiteSpace(dto.Value))
                        return (false, "Sourced by is required.");

                    return await UpdateMasterAsync(
                        _context.ApprovedBy,
                        dto.Id!.Value,
                        x => x.Name,
                        (e, val, img) =>
                        {
                            e.Name = val!;
                        },
                        dto.Value!,
                        null,
                        "Entered sourced by value already exists.",
                        "Sourced by updated successfully."
                    );

                case "special-filters":

                    if (string.IsNullOrWhiteSpace(dto.Value))
                        return (false, "Tag is required.");

                    return await UpdateMasterAsync(
                        _context.InvestmentTag,
                        dto.Id!.Value,
                        x => x.Tag,
                        (e, val, img) =>
                        {
                            e.Tag = val!;
                        },
                        dto.Value!,
                        null,
                        "Entered tag value already exists.",
                        "Special filter updated successfully."
                    );

                case "transaction-type":

                    if (string.IsNullOrWhiteSpace(dto.Value))
                        return (false, "Transaction type is required.");

                    return await UpdateMasterAsync(
                        _context.SiteConfiguration.Where(x => x.Type == SiteConfigurationType.TransactionType),
                        dto.Id!.Value,
                        x => x.Value,
                        (e, val, img) =>
                        {
                            e.Key = val!;
                            e.Value = val!;
                        },
                        dto.Value!,
                        null,
                        "Entered transaction type value already exists.",
                        "Transaction type updated successfully."
                    );

                case "themes":

                    if (string.IsNullOrWhiteSpace(dto.Value))
                        return (false, "Theme is required.");

                    string? fileName = null;

                    if (!string.IsNullOrWhiteSpace(dto.Image))
                        fileName = await UploadBase64File(dto.Image);

                    return await UpdateMasterAsync(
                        _context.Themes,
                        dto.Id!.Value,
                        x => x.Name,
                        (e, val, img) =>
                        {
                            e.Name = val!;
                            if (img != null)
                                e.ImageFileName = img;
                        },
                        dto.Value,
                        fileName,
                        "Entered theme value already exists.",
                        "Theme updated successfully."
                    );

                default:
                    return (false, "Invalid configuration type.");
            }
        }

        private async Task<(bool Success, string Message)> CreateMasterAsync<T>(
            IQueryable<T> query,
            T entity,
            Expression<Func<T, string>> selector,
            string duplicateMessage,
            string successMessage)
            where T : class
        {
            var value = selector.Compile()(entity).Trim();
            var parameter = selector.Parameters[0];
            var property = selector.Body;
            var trimMethod = typeof(string).GetMethod(nameof(string.Trim), Type.EmptyTypes)!;
            var left = Expression.Call(property, trimMethod);
            var right = Expression.Constant(value);
            var body = Expression.Equal(left, right);
            var lambda = Expression.Lambda<Func<T, bool>>(body, parameter);

            if (await query.AnyAsync(lambda))
                return (false, duplicateMessage);

            await _context.Set<T>().AddAsync(entity);
            await _context.SaveChangesAsync();

            return (true, successMessage);
        }

        private async Task<(bool Success, string Message)> UpdateMasterAsync<T>(
            IQueryable<T> query,
            int id,
            Expression<Func<T, string>> selector,
            Action<T, string?, string?> updateAction,
            string? newValue,
            string? image,
            string duplicateMessage,
            string successMessage)
            where T : class
        {
            var entity = await _context.Set<T>().FindAsync(id);

            if (entity == null)
                return (false, "Record not found.");

            var parameter = selector.Parameters[0];
            var property = selector.Body;
            var trimMethod = typeof(string).GetMethod(nameof(string.Trim), Type.EmptyTypes)!;
            var left = Expression.Call(property, trimMethod);
            var right = Expression.Constant(newValue!.Trim());
            var equalExpression = Expression.Equal(left, right);
            var idProperty = Expression.Property(parameter, "Id");
            var idConstant = Expression.Constant(id);
            var notEqualId = Expression.NotEqual(idProperty, idConstant);
            var finalBody = Expression.AndAlso(notEqualId, equalExpression);
            var lambda = Expression.Lambda<Func<T, bool>>(finalBody, parameter);

            if (await query.AnyAsync(lambda))
                return (false, duplicateMessage);

            updateAction(entity, newValue?.Trim(), image);

            await _context.SaveChangesAsync();

            return (true, successMessage);
        }

        private async Task<(bool Success, string Message)> DeleteMasterAsync<T>(
            int id,
            Expression<Func<T, bool>>? extraFilter,
            Func<T, Task<bool>> isUsedCheck,
            string usedMessage,
            string successMessage)
            where T : class
        {
            IQueryable<T> query = _context.Set<T>();

            if (extraFilter != null)
                query = query.Where(extraFilter);

            var entity = await query.FirstOrDefaultAsync(e => EF.Property<int>(e, "Id") == id);

            if (entity == null)
                return (false, "Record not found.");

            if (await isUsedCheck(entity))
                return (false, usedMessage);

            _context.Set<T>().Remove(entity);
            await _context.SaveChangesAsync();

            return (true, successMessage);
        }

        private string? GetColumnValue(CampaignDto c, string type)
        {
            return type.ToLower() switch
            {
                "themes" => c.Themes,
                "sourcedby" => c.ApprovedBy,
                "sdgs" => c.SDGs,
                _ => null
            };
        }

        private void SetColumnValue(CampaignDto c, string type, string? value)
        {
            switch (type.ToLower())
            {
                case "themes": c.Themes = value; break;
                case "sourcedby": c.ApprovedBy = value; break;
                case "sdgs": c.SDGs = value; break;
            }
        }

        private async Task<string> UploadBase64File(string base64Data)
        {
            if (string.IsNullOrWhiteSpace(base64Data))
                return string.Empty;

            string fileName = $"{Guid.NewGuid()}.jpg";
            var blob = _blobContainerClient.GetBlockBlobClient(fileName);

            var dataIndex = base64Data.Substring(base64Data.IndexOf(',') + 1);
            var bytes = Convert.FromBase64String(dataIndex);

            using var stream = new MemoryStream(bytes);
            await blob.UploadAsync(stream);

            return fileName;
        }
    }
}
