using AutoMapper;
using Invest.Core.Dtos;
using Invest.Core.Models;

namespace Invest.Core.Mappings;

public class UserNotificationMappingProfile : Profile
{
    public UserNotificationMappingProfile()
    {
        CreateMap<UsersNotification, UserNotificationDto>()
            .ForMember(i => i.PictureFileName, x => x.MapFrom(src => src.PictureFileName));

        CreateMap<UserNotificationDto, UsersNotification>()
            .ForMember(i => i.PictureFileName, x => x.MapFrom(src => src.PictureFileName));

        CreateMap<AddUserNotificationDto, UsersNotification>()
            .ForMember(i => i.PictureFileName, x => x.MapFrom(src => src.PictureFileName));
    }
}