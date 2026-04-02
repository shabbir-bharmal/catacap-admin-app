using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedInnerExceptionMessageAndInnerExceptionStackTraceOnApiErrorLogTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "InnerExceptionMessage",
                table: "ApiErrorLog",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InnerExceptionStackTrace",
                table: "ApiErrorLog",
                type: "nvarchar(max)",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "InnerExceptionMessage",
                table: "ApiErrorLog");

            migrationBuilder.DropColumn(
                name: "InnerExceptionStackTrace",
                table: "ApiErrorLog");
        }
    }
}
