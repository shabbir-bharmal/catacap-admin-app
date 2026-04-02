using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedDeletedColumnOnScheduledEmailLogsTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "ScheduledEmailLogs",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "ScheduledEmailLogs",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "ScheduledEmailLogs",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_ScheduledEmailLogs_DeletedBy",
                table: "ScheduledEmailLogs",
                column: "DeletedBy");

            migrationBuilder.AddForeignKey(
                name: "FK_ScheduledEmailLogs_AspNetUsers_DeletedBy",
                table: "ScheduledEmailLogs",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ScheduledEmailLogs_AspNetUsers_DeletedBy",
                table: "ScheduledEmailLogs");

            migrationBuilder.DropIndex(
                name: "IX_ScheduledEmailLogs_DeletedBy",
                table: "ScheduledEmailLogs");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "ScheduledEmailLogs");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "ScheduledEmailLogs");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "ScheduledEmailLogs");
        }
    }
}
