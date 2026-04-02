// Ignore Spelling: Dto Dtos

namespace Invest.Core.Dtos
{
    public class UsersImportDto
    {
        public int groupId { get; init; }
        public UserRegistrationDto[] users { get; init; } = { };
    }
}
