using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedIsDeletedColumnOnFormSubmissionTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<DateTime>(
                name: "CreatedAt",
                table: "FormSubmission",
                type: "datetime",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "datetime2");

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "FormSubmission",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "ModifiedAt",
                table: "FormSubmission",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ModifiedBy",
                table: "FormSubmission",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ModifiedByUserId",
                table: "FormSubmission",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_FormSubmission_ModifiedByUserId",
                table: "FormSubmission",
                column: "ModifiedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_FormSubmission_AspNetUsers_ModifiedByUserId",
                table: "FormSubmission",
                column: "ModifiedByUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_FormSubmission_AspNetUsers_ModifiedByUserId",
                table: "FormSubmission");

            migrationBuilder.DropIndex(
                name: "IX_FormSubmission_ModifiedByUserId",
                table: "FormSubmission");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "FormSubmission");

            migrationBuilder.DropColumn(
                name: "ModifiedAt",
                table: "FormSubmission");

            migrationBuilder.DropColumn(
                name: "ModifiedBy",
                table: "FormSubmission");

            migrationBuilder.DropColumn(
                name: "ModifiedByUserId",
                table: "FormSubmission");

            migrationBuilder.AlterColumn<DateTime>(
                name: "CreatedAt",
                table: "FormSubmission",
                type: "datetime2",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "datetime");
        }
    }
}
