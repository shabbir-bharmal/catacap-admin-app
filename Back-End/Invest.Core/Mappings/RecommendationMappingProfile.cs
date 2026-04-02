using AutoMapper;
using Invest.Core.Dtos;
using Invest.Core.Models;

namespace Invest.Core.Mappings;

public class RecommendationMappingProfile : Profile
{
    public RecommendationMappingProfile() 
    {
        CreateMap<RecommendationsDto, Recommendation>();
        CreateMap<Recommendation, RecommendationsDto>();
        CreateMap<AddRecommendationDto, Recommendation>()
            .ForMember(dest => dest.Id, opt => opt.Ignore())
            .ForMember(dest => dest.User, opt => opt.Ignore())
            .ForMember(dest => dest.Campaign, opt => opt.Ignore());
        CreateMap<InvestmentFeedbackDto, InvestmentFeedback>();
    }
}
