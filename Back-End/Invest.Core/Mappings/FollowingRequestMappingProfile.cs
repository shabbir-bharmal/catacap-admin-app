using AutoMapper;
using Invest.Core.Dtos;
using Invest.Core.Models;

namespace Invest.Core.Mappings;

public class FollowingRequestMappingProfile : Profile
{
    public FollowingRequestMappingProfile()
    {
        CreateMap<FollowingRequest, FollowingRequestDto>()
            .ForMember(i => i.UserToFollowId, x => x.MapFrom(src => src.RequestOwner!.Id))
            .ForMember(i => i.RequestOwnerName, x => x.MapFrom(src => src.RequestOwner!.FirstName + " " + src.RequestOwner.LastName))
            .ForMember(i => i.RequestOwnerPicture, x => x.MapFrom(src => src.RequestOwner!.ConsentToShowAvatar ? src.RequestOwner!.PictureFileName : null));
        CreateMap<FollowingRequestDto, FollowingRequestDto>();
        CreateMap<AddFollowingRequestDto, FollowingRequest>();
    }
}