using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class CreatedFormSubmissionNotesTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_FormSubmission_AspNetUsers_ModifiedByUserId",
                table: "FormSubmission");

            migrationBuilder.DropIndex(
                name: "IX_FormSubmission_ModifiedByUserId",
                table: "FormSubmission");

            migrationBuilder.DropColumn(
                name: "ModifiedAt",
                table: "FormSubmission");

            migrationBuilder.DropColumn(
                name: "ModifiedByUserId",
                table: "FormSubmission");

            migrationBuilder.RenameColumn(
                name: "ModifiedBy",
                table: "FormSubmission",
                newName: "TargetRaiseAmount");

            migrationBuilder.AddColumn<string>(
                name: "LaunchPartners",
                table: "FormSubmission",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SelfRaiseAmountRange",
                table: "FormSubmission",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "FormSubmission",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateTable(
                name: "FormSubmissionNotes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    FormSubmissionId = table.Column<int>(type: "int", nullable: true),
                    Note = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    OldStatus = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    NewStatus = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedBy = table.Column<string>(type: "nvarchar(450)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FormSubmissionNotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FormSubmissionNotes_AspNetUsers_CreatedBy",
                        column: x => x.CreatedBy,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_FormSubmissionNotes_FormSubmission_FormSubmissionId",
                        column: x => x.FormSubmissionId,
                        principalTable: "FormSubmission",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_FormSubmissionNotes_CreatedBy",
                table: "FormSubmissionNotes",
                column: "CreatedBy");

            migrationBuilder.CreateIndex(
                name: "IX_FormSubmissionNotes_FormSubmissionId",
                table: "FormSubmissionNotes",
                column: "FormSubmissionId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FormSubmissionNotes");

            migrationBuilder.DropColumn(
                name: "LaunchPartners",
                table: "FormSubmission");

            migrationBuilder.DropColumn(
                name: "SelfRaiseAmountRange",
                table: "FormSubmission");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "FormSubmission");

            migrationBuilder.RenameColumn(
                name: "TargetRaiseAmount",
                table: "FormSubmission",
                newName: "ModifiedBy");

            migrationBuilder.AddColumn<DateTime>(
                name: "ModifiedAt",
                table: "FormSubmission",
                type: "datetime",
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
    }
}
