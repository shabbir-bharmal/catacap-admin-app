using System.ComponentModel.DataAnnotations;

namespace Invest.Core.Models
{
    public class UserStripeCustomerMapping
    {
        [Key]
        public Guid? Id { get; set; } = Guid.NewGuid();
        public Guid? UserId { get; set; }
        public string? CustomerId { get; set; }
        public string? CardDetailToken { get; set; }
    }
}
