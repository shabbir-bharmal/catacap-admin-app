using AutoMapper;
using Invest.Core.Dtos;
using Invest.Core.Models;

namespace Invest.Core.Mappings
{
    public class GroupMappingProfile : Profile
    {
        public GroupMappingProfile()
        {
            CreateMap<Group, FollowingDataDto>()
                .ForMember(i => i.FollowingId, x => x.MapFrom(src => src.Id.ToString()))
                .ForMember(i => i.PictureFileName, x => x.MapFrom(src => src.PictureFileName))
                .ForMember(i => i.Name, x => x.MapFrom(src => src.Name + " (Group)"))
                .ForMember(i => i.IsGroup, x => x.MapFrom(src => true))
                .ForMember(i => i.Description, x => x.MapFrom(src => src.Description));

            CreateMap<Group, GroupDto>()
                .ForMember(i => i.PictureFileName, x => x.MapFrom(src => src.PictureFileName))
                .ForMember(i => i.BackgroundPictureFileName, x => x.MapFrom(src => src.BackgroundPictureFileName));

            CreateMap<GroupDto, Group>()
                .ForMember(i => i.PictureFileName, x => x.MapFrom(src => src.PictureFileName))
                .ForMember(i => i.BackgroundPictureFileName, x => x.MapFrom(src => src.BackgroundPictureFileName));

            CreateMap<CreateGroupDto, Group>()
                .ForMember(i => i.PictureFileName, x => x.MapFrom(src => src.PictureFileName))
                .ForMember(i => i.BackgroundPictureFileName, x => x.MapFrom(src => src.BackgroundPictureFileName));

            CreateMap<GroupAccountBalance, GroupAccountBalanceDto>().ReverseMap();
        }
    }
}