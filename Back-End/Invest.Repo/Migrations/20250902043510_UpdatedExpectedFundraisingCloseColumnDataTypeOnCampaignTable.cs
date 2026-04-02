using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class UpdatedExpectedFundraisingCloseColumnDataTypeOnCampaignTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ExpectedFundraisingClose",
                table: "Campaigns");

            migrationBuilder.AddColumn<DateTime>(
                name: "FundraisingCloseDate",
                table: "Campaigns",
                type: "date",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FundraisingCloseDate",
                table: "Campaigns");

            migrationBuilder.AddColumn<string>(
                name: "ExpectedFundraisingClose",
                table: "Campaigns",
                type: "nvarchar(max)",
                nullable: true);
        }
    }
}
