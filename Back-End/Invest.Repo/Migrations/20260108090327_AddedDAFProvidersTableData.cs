using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedDAFProvidersTableData : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "DAFProviders",
                columns: new[] { "Id", "IsActive", "ProviderName", "ProviderURL" },
                values: new object[,]
                {
                    { 1, true, "Fidelity Charitable", "https://charitablegift.fidelity.com/public/login/donor" },
                    { 2, true, "Jewish Foundation", "https://www.iphiview.com/ujef/Home/tabid/326/Default.aspx" },
                    { 3, true, "ImpactAssets", "https://iphi.stellartechsol.com/calvert/LogIn/tabid/444/Default.aspx" },
                    { 4, true, "National Philanthropic Trust", "https://nptgivingpoint.org/" },
                    { 5, true, "DAFgiving360: Charles Schwab", "https://www.schwab.com/" },
                    { 6, true, "Silicon Valley Community Foundation", "https://donor.siliconvalleycf.org/s/login/" },
                    { 7, true, "Vanguard Charitable", "https://www.vanguardcharitable.org/" },
                    { 8, true, "Bay Area Jewish Federation", "https://jewishfed.my.site.com/portal/s/login/" }
                });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "DAFProviders",
                keyColumn: "Id",
                keyValue: 1);

            migrationBuilder.DeleteData(
                table: "DAFProviders",
                keyColumn: "Id",
                keyValue: 2);

            migrationBuilder.DeleteData(
                table: "DAFProviders",
                keyColumn: "Id",
                keyValue: 3);

            migrationBuilder.DeleteData(
                table: "DAFProviders",
                keyColumn: "Id",
                keyValue: 4);

            migrationBuilder.DeleteData(
                table: "DAFProviders",
                keyColumn: "Id",
                keyValue: 5);

            migrationBuilder.DeleteData(
                table: "DAFProviders",
                keyColumn: "Id",
                keyValue: 6);

            migrationBuilder.DeleteData(
                table: "DAFProviders",
                keyColumn: "Id",
                keyValue: 7);

            migrationBuilder.DeleteData(
                table: "DAFProviders",
                keyColumn: "Id",
                keyValue: 8);
        }
    }
}
