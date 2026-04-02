using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedRejectionColumnToRecommendationAndPendingGrantsTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PendingGrants_AspNetUsers_UserId",
                table: "PendingGrants");

            migrationBuilder.AddColumn<string>(
                name: "RejectedBy",
                table: "Recommendations",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RejectionDate",
                table: "Recommendations",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RejectionMemo",
                table: "Recommendations",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RejectedBy",
                table: "PendingGrants",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RejectionDate",
                table: "PendingGrants",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RejectionMemo",
                table: "PendingGrants",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Recommendations_RejectedBy",
                table: "Recommendations",
                column: "RejectedBy");

            migrationBuilder.CreateIndex(
                name: "IX_PendingGrants_RejectedBy",
                table: "PendingGrants",
                column: "RejectedBy");

            migrationBuilder.AddForeignKey(
                name: "FK_PendingGrants_AspNetUsers_RejectedBy",
                table: "PendingGrants",
                column: "RejectedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_PendingGrants_AspNetUsers_UserId",
                table: "PendingGrants",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Recommendations_AspNetUsers_RejectedBy",
                table: "Recommendations",
                column: "RejectedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PendingGrants_AspNetUsers_RejectedBy",
                table: "PendingGrants");

            migrationBuilder.DropForeignKey(
                name: "FK_PendingGrants_AspNetUsers_UserId",
                table: "PendingGrants");

            migrationBuilder.DropForeignKey(
                name: "FK_Recommendations_AspNetUsers_RejectedBy",
                table: "Recommendations");

            migrationBuilder.DropIndex(
                name: "IX_Recommendations_RejectedBy",
                table: "Recommendations");

            migrationBuilder.DropIndex(
                name: "IX_PendingGrants_RejectedBy",
                table: "PendingGrants");

            migrationBuilder.DropColumn(
                name: "RejectedBy",
                table: "Recommendations");

            migrationBuilder.DropColumn(
                name: "RejectionDate",
                table: "Recommendations");

            migrationBuilder.DropColumn(
                name: "RejectionMemo",
                table: "Recommendations");

            migrationBuilder.DropColumn(
                name: "RejectedBy",
                table: "PendingGrants");

            migrationBuilder.DropColumn(
                name: "RejectionDate",
                table: "PendingGrants");

            migrationBuilder.DropColumn(
                name: "RejectionMemo",
                table: "PendingGrants");

            migrationBuilder.AddForeignKey(
                name: "FK_PendingGrants_AspNetUsers_UserId",
                table: "PendingGrants",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
