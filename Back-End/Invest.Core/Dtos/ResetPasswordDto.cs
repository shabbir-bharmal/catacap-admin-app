// Ignore Spelling: Dto Dtos

using System.ComponentModel.DataAnnotations;

namespace Invest.Core.Dtos
{
    public class ResetPasswordDto
    {
        [Required(ErrorMessage = "Email is a required field.")]
        public string Email { get; set; } = string.Empty;

        [Required(ErrorMessage = "Password is a required field.")]
        public string Password { get; set; } = string.Empty;
    }
}
