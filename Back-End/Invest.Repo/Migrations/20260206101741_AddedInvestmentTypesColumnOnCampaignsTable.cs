using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedInvestmentTypesColumnOnCampaignsTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DebtInterestRate",
                table: "Campaigns",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DebtMaturityDate",
                table: "Campaigns",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DebtPaymentFrequency",
                table: "Campaigns",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EquitySecurityType",
                table: "Campaigns",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "EquityTargetReturn",
                table: "Campaigns",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "EquityValuation",
                table: "Campaigns",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "FundTerm",
                table: "Campaigns",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InvestmentTypeCategory",
                table: "Campaigns",
                type: "nvarchar(max)",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DebtInterestRate",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "DebtMaturityDate",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "DebtPaymentFrequency",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "EquitySecurityType",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "EquityTargetReturn",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "EquityValuation",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "FundTerm",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "InvestmentTypeCategory",
                table: "Campaigns");
        }
    }
}
