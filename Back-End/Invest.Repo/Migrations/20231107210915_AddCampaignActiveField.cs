using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddCampaignActiveField : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "Campaigns",
                type: "bit",
                nullable: true);
            migrationBuilder.AddColumn<bool>(
             name: "EmailSends",
             table: "Campaigns",
             type: "bit",
             nullable: false,
             defaultValue: false);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "Campaigns");
            migrationBuilder.DropColumn(
            name: "EmailSends",
            table: "Campaigns");
        }
    }
}
