using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedAdditionalDetailsColumnOnSiteConfigurationTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AdditionalDetails",
                table: "SiteConfiguration",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MetaDescription",
                table: "Groups",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MetaTitle",
                table: "Groups",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MetaDescription",
                table: "Campaigns",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MetaTitle",
                table: "Campaigns",
                type: "nvarchar(max)",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AdditionalDetails",
                table: "SiteConfiguration");

            migrationBuilder.DropColumn(
                name: "MetaDescription",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "MetaTitle",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "MetaDescription",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "MetaTitle",
                table: "Campaigns");
        }
    }
}
