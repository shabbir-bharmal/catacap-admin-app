using Invest.Core.Constants;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedStatusAndQuoteColumnOnDisbursalRequestTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Quote",
                table: "DisbursalRequest",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "DisbursalRequest",
                type: "int",
                nullable: false,
                defaultValue: DisbursalRequestStatus.Pending);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Quote",
                table: "DisbursalRequest");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "DisbursalRequest");
        }
    }
}
