using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedDeletedColumnOnAllTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_GroupAccountBalance_AspNetUsers_UserId",
                table: "GroupAccountBalance");

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "UsersNotifications",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "UsersNotifications",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "UsersNotifications",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "UserInvestments",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "UserInvestments",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "UserInvestments",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Themes",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "Themes",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Themes",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Testimonial",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "Testimonial",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Testimonial",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "SiteConfiguration",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "SiteConfiguration",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "SiteConfiguration",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "ReturnDetails",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "ReturnDetails",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "ReturnDetails",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Requests",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "Requests",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Requests",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Recommendations",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "Recommendations",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Recommendations",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "PendingGrants",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "PendingGrants",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "PendingGrants",
                type: "bit",
                nullable: false,
                defaultValue: false);

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
                table: "News",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "News",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "News",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "LeaderGroup",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "LeaderGroup",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "LeaderGroup",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "InvestmentTag",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "InvestmentTag",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "InvestmentTag",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "InvestmentRequest",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "InvestmentRequest",
                type: "nvarchar(450)",
                nullable: true);

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
                table: "InvestmentFeedback",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "InvestmentFeedback",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "InvestmentFeedback",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Groups",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "Groups",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Groups",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AlterColumn<string>(
                name: "UserId",
                table: "GroupAccountBalance",
                type: "nvarchar(450)",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "nvarchar(450)",
                oldNullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "GroupAccountBalance",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "GroupAccountBalance",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "GroupAccountBalance",
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
                table: "FormSubmission",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "FormSubmission",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Faq",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "Faq",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Faq",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Event",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "Event",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Event",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "EmailTemplate",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "EmailTemplate",
                type: "nvarchar(450)",
                nullable: true);

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
                table: "DisbursalRequest",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "DisbursalRequest",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "DisbursalRequest",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "CompletedInvestmentsDetails",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "CompletedInvestmentsDetails",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "CompletedInvestmentsDetails",
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
                table: "CataCapTeam",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "CataCapTeam",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "CataCapTeam",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Campaigns",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "Campaigns",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Campaigns",
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

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "AssetBasedPaymentRequest",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "AssetBasedPaymentRequest",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "AssetBasedPaymentRequest",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "AspNetUsers",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "AspNetUsers",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "AspNetUsers",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "ApprovedBy",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "ApprovedBy",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "ApprovedBy",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "AccountBalanceChangeLogs",
                type: "datetime",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                table: "AccountBalanceChangeLogs",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "AccountBalanceChangeLogs",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_UsersNotifications_DeletedBy",
                table: "UsersNotifications",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_UserInvestments_DeletedBy",
                table: "UserInvestments",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_Themes_DeletedBy",
                table: "Themes",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_Testimonial_DeletedBy",
                table: "Testimonial",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_SiteConfiguration_DeletedBy",
                table: "SiteConfiguration",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_ReturnDetails_DeletedBy",
                table: "ReturnDetails",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_Requests_DeletedBy",
                table: "Requests",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_Recommendations_DeletedBy",
                table: "Recommendations",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_PendingGrants_DeletedBy",
                table: "PendingGrants",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_PendingGrantNotes_DeletedBy",
                table: "PendingGrantNotes",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_News_DeletedBy",
                table: "News",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_LeaderGroup_DeletedBy",
                table: "LeaderGroup",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentTag_DeletedBy",
                table: "InvestmentTag",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentRequest_DeletedBy",
                table: "InvestmentRequest",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentNotes_DeletedBy",
                table: "InvestmentNotes",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentFeedback_DeletedBy",
                table: "InvestmentFeedback",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_Groups_DeletedBy",
                table: "Groups",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_GroupAccountBalance_DeletedBy",
                table: "GroupAccountBalance",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_FormSubmissionNotes_DeletedBy",
                table: "FormSubmissionNotes",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_FormSubmission_DeletedBy",
                table: "FormSubmission",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_Faq_DeletedBy",
                table: "Faq",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_Event_DeletedBy",
                table: "Event",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_EmailTemplate_DeletedBy",
                table: "EmailTemplate",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_DisbursalRequestNotes_DeletedBy",
                table: "DisbursalRequestNotes",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_DisbursalRequest_DeletedBy",
                table: "DisbursalRequest",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_CompletedInvestmentsDetails_DeletedBy",
                table: "CompletedInvestmentsDetails",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_CompletedInvestmentNotes_DeletedBy",
                table: "CompletedInvestmentNotes",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_CataCapTeam_DeletedBy",
                table: "CataCapTeam",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_Campaigns_DeletedBy",
                table: "Campaigns",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_AssetBasedPaymentRequestNotes_DeletedBy",
                table: "AssetBasedPaymentRequestNotes",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_AssetBasedPaymentRequest_DeletedBy",
                table: "AssetBasedPaymentRequest",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_ApprovedBy_DeletedBy",
                table: "ApprovedBy",
                column: "DeletedBy");

            migrationBuilder.CreateIndex(
                name: "IX_AccountBalanceChangeLogs_DeletedBy",
                table: "AccountBalanceChangeLogs",
                column: "DeletedBy");

            migrationBuilder.AddForeignKey(
                name: "FK_AccountBalanceChangeLogs_AspNetUsers_DeletedBy",
                table: "AccountBalanceChangeLogs",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ApprovedBy_AspNetUsers_DeletedBy",
                table: "ApprovedBy",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_AssetBasedPaymentRequest_AspNetUsers_DeletedBy",
                table: "AssetBasedPaymentRequest",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_AssetBasedPaymentRequestNotes_AspNetUsers_DeletedBy",
                table: "AssetBasedPaymentRequestNotes",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Campaigns_AspNetUsers_DeletedBy",
                table: "Campaigns",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_CataCapTeam_AspNetUsers_DeletedBy",
                table: "CataCapTeam",
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
                name: "FK_CompletedInvestmentsDetails_AspNetUsers_DeletedBy",
                table: "CompletedInvestmentsDetails",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_DisbursalRequest_AspNetUsers_DeletedBy",
                table: "DisbursalRequest",
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
                name: "FK_EmailTemplate_AspNetUsers_DeletedBy",
                table: "EmailTemplate",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Event_AspNetUsers_DeletedBy",
                table: "Event",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Faq_AspNetUsers_DeletedBy",
                table: "Faq",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_FormSubmission_AspNetUsers_DeletedBy",
                table: "FormSubmission",
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
                name: "FK_GroupAccountBalance_AspNetUsers_DeletedBy",
                table: "GroupAccountBalance",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_GroupAccountBalance_AspNetUsers_UserId",
                table: "GroupAccountBalance",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Groups_AspNetUsers_DeletedBy",
                table: "Groups",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_InvestmentFeedback_AspNetUsers_DeletedBy",
                table: "InvestmentFeedback",
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
                name: "FK_InvestmentRequest_AspNetUsers_DeletedBy",
                table: "InvestmentRequest",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_InvestmentTag_AspNetUsers_DeletedBy",
                table: "InvestmentTag",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_LeaderGroup_AspNetUsers_DeletedBy",
                table: "LeaderGroup",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_News_AspNetUsers_DeletedBy",
                table: "News",
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

            migrationBuilder.AddForeignKey(
                name: "FK_PendingGrants_AspNetUsers_DeletedBy",
                table: "PendingGrants",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Recommendations_AspNetUsers_DeletedBy",
                table: "Recommendations",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Requests_AspNetUsers_DeletedBy",
                table: "Requests",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ReturnDetails_AspNetUsers_DeletedBy",
                table: "ReturnDetails",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SiteConfiguration_AspNetUsers_DeletedBy",
                table: "SiteConfiguration",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Testimonial_AspNetUsers_DeletedBy",
                table: "Testimonial",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Themes_AspNetUsers_DeletedBy",
                table: "Themes",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_UserInvestments_AspNetUsers_DeletedBy",
                table: "UserInvestments",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_UsersNotifications_AspNetUsers_DeletedBy",
                table: "UsersNotifications",
                column: "DeletedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AccountBalanceChangeLogs_AspNetUsers_DeletedBy",
                table: "AccountBalanceChangeLogs");

            migrationBuilder.DropForeignKey(
                name: "FK_ApprovedBy_AspNetUsers_DeletedBy",
                table: "ApprovedBy");

            migrationBuilder.DropForeignKey(
                name: "FK_AssetBasedPaymentRequest_AspNetUsers_DeletedBy",
                table: "AssetBasedPaymentRequest");

            migrationBuilder.DropForeignKey(
                name: "FK_AssetBasedPaymentRequestNotes_AspNetUsers_DeletedBy",
                table: "AssetBasedPaymentRequestNotes");

            migrationBuilder.DropForeignKey(
                name: "FK_Campaigns_AspNetUsers_DeletedBy",
                table: "Campaigns");

            migrationBuilder.DropForeignKey(
                name: "FK_CataCapTeam_AspNetUsers_DeletedBy",
                table: "CataCapTeam");

            migrationBuilder.DropForeignKey(
                name: "FK_CompletedInvestmentNotes_AspNetUsers_DeletedBy",
                table: "CompletedInvestmentNotes");

            migrationBuilder.DropForeignKey(
                name: "FK_CompletedInvestmentsDetails_AspNetUsers_DeletedBy",
                table: "CompletedInvestmentsDetails");

            migrationBuilder.DropForeignKey(
                name: "FK_DisbursalRequest_AspNetUsers_DeletedBy",
                table: "DisbursalRequest");

            migrationBuilder.DropForeignKey(
                name: "FK_DisbursalRequestNotes_AspNetUsers_DeletedBy",
                table: "DisbursalRequestNotes");

            migrationBuilder.DropForeignKey(
                name: "FK_EmailTemplate_AspNetUsers_DeletedBy",
                table: "EmailTemplate");

            migrationBuilder.DropForeignKey(
                name: "FK_Event_AspNetUsers_DeletedBy",
                table: "Event");

            migrationBuilder.DropForeignKey(
                name: "FK_Faq_AspNetUsers_DeletedBy",
                table: "Faq");

            migrationBuilder.DropForeignKey(
                name: "FK_FormSubmission_AspNetUsers_DeletedBy",
                table: "FormSubmission");

            migrationBuilder.DropForeignKey(
                name: "FK_FormSubmissionNotes_AspNetUsers_DeletedBy",
                table: "FormSubmissionNotes");

            migrationBuilder.DropForeignKey(
                name: "FK_GroupAccountBalance_AspNetUsers_DeletedBy",
                table: "GroupAccountBalance");

            migrationBuilder.DropForeignKey(
                name: "FK_GroupAccountBalance_AspNetUsers_UserId",
                table: "GroupAccountBalance");

            migrationBuilder.DropForeignKey(
                name: "FK_Groups_AspNetUsers_DeletedBy",
                table: "Groups");

            migrationBuilder.DropForeignKey(
                name: "FK_InvestmentFeedback_AspNetUsers_DeletedBy",
                table: "InvestmentFeedback");

            migrationBuilder.DropForeignKey(
                name: "FK_InvestmentNotes_AspNetUsers_DeletedBy",
                table: "InvestmentNotes");

            migrationBuilder.DropForeignKey(
                name: "FK_InvestmentRequest_AspNetUsers_DeletedBy",
                table: "InvestmentRequest");

            migrationBuilder.DropForeignKey(
                name: "FK_InvestmentTag_AspNetUsers_DeletedBy",
                table: "InvestmentTag");

            migrationBuilder.DropForeignKey(
                name: "FK_LeaderGroup_AspNetUsers_DeletedBy",
                table: "LeaderGroup");

            migrationBuilder.DropForeignKey(
                name: "FK_News_AspNetUsers_DeletedBy",
                table: "News");

            migrationBuilder.DropForeignKey(
                name: "FK_PendingGrantNotes_AspNetUsers_DeletedBy",
                table: "PendingGrantNotes");

            migrationBuilder.DropForeignKey(
                name: "FK_PendingGrants_AspNetUsers_DeletedBy",
                table: "PendingGrants");

            migrationBuilder.DropForeignKey(
                name: "FK_Recommendations_AspNetUsers_DeletedBy",
                table: "Recommendations");

            migrationBuilder.DropForeignKey(
                name: "FK_Requests_AspNetUsers_DeletedBy",
                table: "Requests");

            migrationBuilder.DropForeignKey(
                name: "FK_ReturnDetails_AspNetUsers_DeletedBy",
                table: "ReturnDetails");

            migrationBuilder.DropForeignKey(
                name: "FK_SiteConfiguration_AspNetUsers_DeletedBy",
                table: "SiteConfiguration");

            migrationBuilder.DropForeignKey(
                name: "FK_Testimonial_AspNetUsers_DeletedBy",
                table: "Testimonial");

            migrationBuilder.DropForeignKey(
                name: "FK_Themes_AspNetUsers_DeletedBy",
                table: "Themes");

            migrationBuilder.DropForeignKey(
                name: "FK_UserInvestments_AspNetUsers_DeletedBy",
                table: "UserInvestments");

            migrationBuilder.DropForeignKey(
                name: "FK_UsersNotifications_AspNetUsers_DeletedBy",
                table: "UsersNotifications");

            migrationBuilder.DropIndex(
                name: "IX_UsersNotifications_DeletedBy",
                table: "UsersNotifications");

            migrationBuilder.DropIndex(
                name: "IX_UserInvestments_DeletedBy",
                table: "UserInvestments");

            migrationBuilder.DropIndex(
                name: "IX_Themes_DeletedBy",
                table: "Themes");

            migrationBuilder.DropIndex(
                name: "IX_Testimonial_DeletedBy",
                table: "Testimonial");

            migrationBuilder.DropIndex(
                name: "IX_SiteConfiguration_DeletedBy",
                table: "SiteConfiguration");

            migrationBuilder.DropIndex(
                name: "IX_ReturnDetails_DeletedBy",
                table: "ReturnDetails");

            migrationBuilder.DropIndex(
                name: "IX_Requests_DeletedBy",
                table: "Requests");

            migrationBuilder.DropIndex(
                name: "IX_Recommendations_DeletedBy",
                table: "Recommendations");

            migrationBuilder.DropIndex(
                name: "IX_PendingGrants_DeletedBy",
                table: "PendingGrants");

            migrationBuilder.DropIndex(
                name: "IX_PendingGrantNotes_DeletedBy",
                table: "PendingGrantNotes");

            migrationBuilder.DropIndex(
                name: "IX_News_DeletedBy",
                table: "News");

            migrationBuilder.DropIndex(
                name: "IX_LeaderGroup_DeletedBy",
                table: "LeaderGroup");

            migrationBuilder.DropIndex(
                name: "IX_InvestmentTag_DeletedBy",
                table: "InvestmentTag");

            migrationBuilder.DropIndex(
                name: "IX_InvestmentRequest_DeletedBy",
                table: "InvestmentRequest");

            migrationBuilder.DropIndex(
                name: "IX_InvestmentNotes_DeletedBy",
                table: "InvestmentNotes");

            migrationBuilder.DropIndex(
                name: "IX_InvestmentFeedback_DeletedBy",
                table: "InvestmentFeedback");

            migrationBuilder.DropIndex(
                name: "IX_Groups_DeletedBy",
                table: "Groups");

            migrationBuilder.DropIndex(
                name: "IX_GroupAccountBalance_DeletedBy",
                table: "GroupAccountBalance");

            migrationBuilder.DropIndex(
                name: "IX_FormSubmissionNotes_DeletedBy",
                table: "FormSubmissionNotes");

            migrationBuilder.DropIndex(
                name: "IX_FormSubmission_DeletedBy",
                table: "FormSubmission");

            migrationBuilder.DropIndex(
                name: "IX_Faq_DeletedBy",
                table: "Faq");

            migrationBuilder.DropIndex(
                name: "IX_Event_DeletedBy",
                table: "Event");

            migrationBuilder.DropIndex(
                name: "IX_EmailTemplate_DeletedBy",
                table: "EmailTemplate");

            migrationBuilder.DropIndex(
                name: "IX_DisbursalRequestNotes_DeletedBy",
                table: "DisbursalRequestNotes");

            migrationBuilder.DropIndex(
                name: "IX_DisbursalRequest_DeletedBy",
                table: "DisbursalRequest");

            migrationBuilder.DropIndex(
                name: "IX_CompletedInvestmentsDetails_DeletedBy",
                table: "CompletedInvestmentsDetails");

            migrationBuilder.DropIndex(
                name: "IX_CompletedInvestmentNotes_DeletedBy",
                table: "CompletedInvestmentNotes");

            migrationBuilder.DropIndex(
                name: "IX_CataCapTeam_DeletedBy",
                table: "CataCapTeam");

            migrationBuilder.DropIndex(
                name: "IX_Campaigns_DeletedBy",
                table: "Campaigns");

            migrationBuilder.DropIndex(
                name: "IX_AssetBasedPaymentRequestNotes_DeletedBy",
                table: "AssetBasedPaymentRequestNotes");

            migrationBuilder.DropIndex(
                name: "IX_AssetBasedPaymentRequest_DeletedBy",
                table: "AssetBasedPaymentRequest");

            migrationBuilder.DropIndex(
                name: "IX_ApprovedBy_DeletedBy",
                table: "ApprovedBy");

            migrationBuilder.DropIndex(
                name: "IX_AccountBalanceChangeLogs_DeletedBy",
                table: "AccountBalanceChangeLogs");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "UsersNotifications");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "UsersNotifications");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "UsersNotifications");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "UserInvestments");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "UserInvestments");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "UserInvestments");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Themes");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "Themes");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Themes");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Testimonial");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "Testimonial");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Testimonial");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "SiteConfiguration");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "SiteConfiguration");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "SiteConfiguration");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "ReturnDetails");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "ReturnDetails");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "ReturnDetails");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Requests");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "Requests");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Requests");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Recommendations");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "Recommendations");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Recommendations");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "PendingGrants");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "PendingGrants");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "PendingGrants");

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
                table: "News");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "News");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "News");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "LeaderGroup");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "LeaderGroup");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "LeaderGroup");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "InvestmentTag");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "InvestmentTag");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "InvestmentTag");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "InvestmentRequest");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "InvestmentRequest");

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
                table: "InvestmentFeedback");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "InvestmentFeedback");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "InvestmentFeedback");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "GroupAccountBalance");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "GroupAccountBalance");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "GroupAccountBalance");

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
                table: "FormSubmission");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "FormSubmission");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Faq");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "Faq");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Faq");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "EmailTemplate");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "EmailTemplate");

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
                table: "DisbursalRequest");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "DisbursalRequest");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "DisbursalRequest");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "CompletedInvestmentsDetails");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "CompletedInvestmentsDetails");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "CompletedInvestmentsDetails");

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
                table: "CataCapTeam");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "CataCapTeam");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "CataCapTeam");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "AssetBasedPaymentRequestNotes");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "AssetBasedPaymentRequestNotes");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "AssetBasedPaymentRequestNotes");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "AssetBasedPaymentRequest");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "AssetBasedPaymentRequest");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "AssetBasedPaymentRequest");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "ApprovedBy");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "ApprovedBy");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "ApprovedBy");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "AccountBalanceChangeLogs");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                table: "AccountBalanceChangeLogs");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "AccountBalanceChangeLogs");

            migrationBuilder.AlterColumn<string>(
                name: "UserId",
                table: "GroupAccountBalance",
                type: "nvarchar(450)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(450)");

            migrationBuilder.AddForeignKey(
                name: "FK_GroupAccountBalance_AspNetUsers_UserId",
                table: "GroupAccountBalance",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id");
        }
    }
}
