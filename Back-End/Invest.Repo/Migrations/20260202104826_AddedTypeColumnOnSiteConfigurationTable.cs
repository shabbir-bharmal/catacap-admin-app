using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedTypeColumnOnSiteConfigurationTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Type",
                table: "SiteConfiguration",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "SiteConfigurationId",
                table: "CompletedInvestmentsDetails",
                type: "int",
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "ApprovedBy",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_CompletedInvestmentsDetails_SiteConfigurationId",
                table: "CompletedInvestmentsDetails",
                column: "SiteConfigurationId");

            migrationBuilder.AddForeignKey(
                name: "FK_CompletedInvestmentsDetails_SiteConfiguration_SiteConfigurationId",
                table: "CompletedInvestmentsDetails",
                column: "SiteConfigurationId",
                principalTable: "SiteConfiguration",
                principalColumn: "Id");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CompletedInvestmentsDetails_SiteConfiguration_SiteConfigurationId",
                table: "CompletedInvestmentsDetails");

            migrationBuilder.DropIndex(
                name: "IX_CompletedInvestmentsDetails_SiteConfigurationId",
                table: "CompletedInvestmentsDetails");

            migrationBuilder.DropColumn(
                name: "Type",
                table: "SiteConfiguration");

            migrationBuilder.DropColumn(
                name: "SiteConfigurationId",
                table: "CompletedInvestmentsDetails");

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "ApprovedBy",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");
        }
    }
}
