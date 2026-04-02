using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class UpdatedFundraisingCloseDateColumnDataTypeOnCampaignTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "FundraisingCloseDate",
                table: "Campaigns",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(DateTime),
                oldType: "date",
                oldNullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<DateTime>(
                name: "FundraisingCloseDate",
                table: "Campaigns",
                type: "date",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);
        }
    }
}
