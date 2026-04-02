using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedWebhookColumnsToUserStripeTransactionMappingTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "WebhookExecutionDate",
                table: "UserStripeTransactionMapping",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "WebhookResponseData",
                table: "UserStripeTransactionMapping",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "WebhookStatus",
                table: "UserStripeTransactionMapping",
                type: "nvarchar(max)",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "WebhookExecutionDate",
                table: "UserStripeTransactionMapping");

            migrationBuilder.DropColumn(
                name: "WebhookResponseData",
                table: "UserStripeTransactionMapping");

            migrationBuilder.DropColumn(
                name: "WebhookStatus",
                table: "UserStripeTransactionMapping");
        }
    }
}
