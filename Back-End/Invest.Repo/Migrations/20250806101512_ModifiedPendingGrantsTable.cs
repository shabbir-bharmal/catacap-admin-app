using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class ModifiedPendingGrantsTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Email",
                table: "PendingGrants");

            migrationBuilder.DropColumn(
                name: "FirstName",
                table: "PendingGrants");

            migrationBuilder.DropColumn(
                name: "IsSendEmail",
                table: "PendingGrants");

            migrationBuilder.DropColumn(
                name: "LastName",
                table: "PendingGrants");

            migrationBuilder.DropColumn(
                name: "UserName",
                table: "PendingGrants");

            migrationBuilder.AlterColumn<string>(
                name: "ZipCode",
                table: "UserStripeTransactionMapping",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AlterColumn<string>(
                name: "Country",
                table: "UserStripeTransactionMapping",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AddColumn<decimal>(
                name: "DeciAmount",
                table: "PendingGrants",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "DeciInvestedSum",
                table: "PendingGrants",
                type: "decimal(18,2)",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DeciAmount",
                table: "PendingGrants");

            migrationBuilder.DropColumn(
                name: "DeciInvestedSum",
                table: "PendingGrants");

            migrationBuilder.AlterColumn<string>(
                name: "ZipCode",
                table: "UserStripeTransactionMapping",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Country",
                table: "UserStripeTransactionMapping",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Email",
                table: "PendingGrants",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "FirstName",
                table: "PendingGrants",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsSendEmail",
                table: "PendingGrants",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "LastName",
                table: "PendingGrants",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "UserName",
                table: "PendingGrants",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }
    }
}
