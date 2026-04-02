using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedDeletedColumnOnUserRoleTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AssetBasedPaymentRequestNotes_AspNetUsers_DeletedBy",
                table: "AssetBasedPaymentRequestNotes");

            migrationBuilder.DropForeignKey(
                name: "FK_CompletedInvestmentNotes_AspNetUsers_DeletedBy",
                table: "CompletedInvestmentNotes");

            migrationBuilder.DropForeignKey(
                name: "FK_DisbursalRequestNotes_AspNetUsers_DeletedBy",
                table: "DisbursalRequestNotes");

            migrationBuilder.DropForeignKey(
                name: "FK_FormSubmissionNotes_AspNetUsers_DeletedBy",
                table: "FormSubmissionNotes");

            migrationBuilder.DropForeignKey(
                name: "FK_InvestmentNotes_AspNetUsers_DeletedBy",
                table: "InvestmentNotes");

            migrationBuilder.DropForeignKey(
                name: "FK_PendingGrantNotes_AspNetUsers_DeletedBy",
                table: "PendingGrantNotes");

            migrationBuilder.DropIndex(
                name: "IX_PendingGrantNotes_DeletedBy",
                table: "PendingGrantNotes");

            migrationBuilder.DropIndex(
                name: "IX_InvestmentNotes_DeletedBy",
                table: "InvestmentNotes");

            migrationBuilder.DropIndex(
                name: "IX_FormSubmissionNotes_DeletedBy",
                table: "FormSubmissionNotes");

            migrationBuilder.DropIndex(
                name: "IX_DisbursalRequestNotes_DeletedBy",
                table: "DisbursalRequestNotes");

            migrationBuilder.DropIndex(
                name: "IX_CompletedInvestmentNotes_DeletedBy",
                table: "CompletedInvestmentNotes");

            migrationBuilder.DropIndex(
                name: "IX_AssetBasedPaymentRequestNotes_DeletedBy",
                table: "AssetBasedPaymentRequestNotes");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "PendingGrantNotes");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "PendingGrantNotes");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "PendingGrantNotes");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "InvestmentNotes");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "InvestmentNotes");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "InvestmentNotes");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "FormSubmissionNotes");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "FormSubmissionNotes");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "FormSubmissionNotes");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "DisbursalRequestNotes");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "DisbursalRequestNotes");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "DisbursalRequestNotes");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "CompletedInvestmentNotes");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "CompletedInvestmentNotes");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "CompletedInvestmentNotes");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "AssetBasedPaymentRequestNotes");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "AssetBasedPaymentRequestNotes");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "AssetBasedPaymentRequestNotes");

            migrationBuilder.AlterColumn<string>(
                name: "DeletedBy",
                table: "AspNetUsers",
                type: "nvarchar(450)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "AspNetUserRoles",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "AspNetUserRoles",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "AspNetUserRoles",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "AspNetRoles",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "AspNetRoles",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "AspNetRoles",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUsers_DeletedBy",
                table: "AspNetUsers",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUserRoles_DeletedBy",
                table: "AspNetUserRoles",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_AspNetRoles_DeletedBy",
                table: "AspNetRoles",
                column: "DeletedBy");

            migrationBuilder.AddForeignKey(
                name: "FK_AspNetRoles_AspNetUsers_DeletedBy",
                table: "AspNetRoles",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_AspNetUserRoles_AspNetUsers_DeletedBy",
                table: "AspNetUserRoles",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_AspNetUsers_AspNetUsers_DeletedBy",
                table: "AspNetUsers",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AspNetRoles_AspNetUsers_DeletedBy",
                table: "AspNetRoles");

            migrationBuilder.DropForeignKey(
                name: "FK_AspNetUserRoles_AspNetUsers_DeletedBy",
                table: "AspNetUserRoles");

            migrationBuilder.DropForeignKey(
                name: "FK_AspNetUsers_AspNetUsers_DeletedBy",
                table: "AspNetUsers");

            migrationBuilder.DropIndex(
                name: "IX_AspNetUsers_DeletedBy",
                table: "AspNetUsers");

            migrationBuilder.DropIndex(
                name: "IX_AspNetUserRoles_DeletedBy",
                table: "AspNetUserRoles");

            migrationBuilder.DropIndex(
                name: "IX_AspNetRoles_DeletedBy",
                table: "AspNetRoles");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "AspNetUserRoles");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "AspNetUserRoles");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "AspNetUserRoles");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "AspNetRoles");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "AspNetRoles");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "AspNetRoles");

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "PendingGrantNotes",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "PendingGrantNotes",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "PendingGrantNotes",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "InvestmentNotes",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "InvestmentNotes",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "InvestmentNotes",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "FormSubmissionNotes",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "FormSubmissionNotes",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "FormSubmissionNotes",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "DisbursalRequestNotes",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "DisbursalRequestNotes",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "DisbursalRequestNotes",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "CompletedInvestmentNotes",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "CompletedInvestmentNotes",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "CompletedInvestmentNotes",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "AssetBasedPaymentRequestNotes",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "AssetBasedPaymentRequestNotes",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "AssetBasedPaymentRequestNotes",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AlterColumn<string>(
                name: "DeletedBy",
                table: "AspNetUsers",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(450)",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PendingGrantNotes_DeletedBy",
                table: "PendingGrantNotes",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentNotes_DeletedBy",
                table: "InvestmentNotes",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_FormSubmissionNotes_DeletedBy",
                table: "FormSubmissionNotes",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_DisbursalRequestNotes_DeletedBy",
                table: "DisbursalRequestNotes",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_CompletedInvestmentNotes_DeletedBy",
                table: "CompletedInvestmentNotes",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_AssetBasedPaymentRequestNotes_DeletedBy",
                table: "AssetBasedPaymentRequestNotes",
                column: "DeletedBy");

            migrationBuilder.AddForeignKey(
                name: "FK_AssetBasedPaymentRequestNotes_AspNetUsers_DeletedBy",
                table: "AssetBasedPaymentRequestNotes",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_CompletedInvestmentNotes_AspNetUsers_DeletedBy",
                table: "CompletedInvestmentNotes",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_DisbursalRequestNotes_AspNetUsers_DeletedBy",
                table: "DisbursalRequestNotes",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_FormSubmissionNotes_AspNetUsers_DeletedBy",
                table: "FormSubmissionNotes",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_InvestmentNotes_AspNetUsers_DeletedBy",
                table: "InvestmentNotes",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_PendingGrantNotes_AspNetUsers_DeletedBy",
                table: "PendingGrantNotes",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
