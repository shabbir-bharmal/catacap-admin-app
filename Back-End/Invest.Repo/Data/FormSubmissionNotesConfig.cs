using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class FormSubmissionNotesConfig : IEntityTypeConfiguration<FormSubmissionNotes>
    {
        public void Configure(EntityTypeBuilder<FormSubmissionNotes> builder)
        {
            builder.HasKey(x => x.Id);
            builder.HasOne(x => x.FormSubmission).WithMany().HasForeignKey(x => x.FormSubmissionId);
            builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.CreatedBy);
            builder.Property(r => r.CreatedAt).HasColumnType("date");
        }
    }
}
