// Ignore Spelling: Dto

using Invest.Core.Models;
using System.ComponentModel;

namespace Invest.Core.Dtos;

public class AddRecommendationDto
{
    public decimal? Amount { get; set; }
    public bool IsGroupAccountBalance { get; set; }

    [DefaultValue(false)]
    public bool IsRequestForInTransit { get; set; }
    public CampaignDto? Campaign { get; set; }
    public User? User { get; set; }
    public string? UserEmail { get; set; }
    public string? UserFullName { get; set; }
    public PendingGrants? PendingGrants { get; set; }
    public AssetBasedPaymentRequest? AssetBasedPaymentRequest { get; set; }
}