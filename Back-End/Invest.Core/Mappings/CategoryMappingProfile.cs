using AutoMapper;
using Invest.Core.Dtos;
using Invest.Core.Models;

namespace Invest.Core.Mappings;

public class CategoryMappingProfile : Profile
{
    public CategoryMappingProfile()
    {
        CreateMap<Theme, CategoryDto>().ReverseMap();

        CreateMap<CategoryCreationDto, Theme>();

        CreateMap<CategoryUpdateDto, Theme>().ReverseMap();
    }
}
