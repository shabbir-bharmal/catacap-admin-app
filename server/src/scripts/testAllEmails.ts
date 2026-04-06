import { Resend } from "resend";
import pool from "../db.js";

const TARGET_EMAIL = process.env.TEST_EMAIL_TARGET || "developers.shabbir@arsenaltech.com";

const resendApiKey = process.env.RESEND_API_KEY;
if (!resendApiKey) {
  console.error("RESEND_API_KEY environment variable is not set.");
  process.exit(1);
}
const resend = new Resend(resendApiKey);

const LOGO_URL = "https://catacap.org/logo.png";
const SITE_URL = "https://catacap.org";
const UNSUBSCRIBE_URL = "https://catacap.org/settings";
const INVESTMENT_URL = "https://catacap.org/investments/sample-investment";
const INVEST_URL = "https://catacap.org/invest/sample-investment";
const CAMPAIGN_URL = "https://catacap.org/campaign/sample-campaign";
const GROUP_URL = "https://catacap.org/groups/sample-group";
const LOGIN_URL = "https://catacap.org/login";
const BROWSE_URL = "https://catacap.org/investments";
const DISBURSEMENT_URL = "https://catacap.org/admin/disbursements/123";
const PRE_LAUNCH_URL = "https://catacap.org/pre-launch-toolkit";
const PARTNER_BENEFITS_URL = "https://catacap.org/partner-benefits";
const FAQ_URL = "https://catacap.org/faq";

interface TemplateConfig {
  name: string;
  variables: Record<string, string>;
}

const templateConfigs: Record<number, TemplateConfig> = {
  1: {
    name: "WelcomeAnonymousUser",
    variables: {
      firstName: "John",
      userName: "johndoe",
      resetPasswordUrl: `${SITE_URL}/reset-password?token=sample-token`,
      logoUrl: LOGO_URL,
      siteUrl: SITE_URL,
    },
  },
  2: {
    name: "WelcomeRegisteredUser",
    variables: {
      firstName: "John",
      userName: "johndoe",
      resetPasswordUrl: `${SITE_URL}/reset-password?token=sample-token`,
      logoUrl: LOGO_URL,
      siteUrl: SITE_URL,
    },
  },
  3: {
    name: "PasswordReset",
    variables: {
      logoUrl: LOGO_URL,
      firstName: "John",
      resetCode: "482917",
    },
  },
  4: {
    name: "DAFDonationInstructions",
    variables: {
      firstName: "John",
      logoUrl: LOGO_URL,
      siteUrl: SITE_URL,
      formattedAmount: "$1,500.00",
      investmentScenario: "Green Energy Fund",
      dafProviderName: "Fidelity Charitable",
      dafProviderLink: "https://www.fidelitycharitable.org",
      donationRecipient: "CataCap Foundation",
    },
  },
  5: {
    name: "FoundationDonationInstructions",
    variables: {
      firstName: "John",
      logoUrl: LOGO_URL,
      siteUrl: SITE_URL,
      formattedAmount: "$2,000.00",
      investmentScenarios: "Sustainable Agriculture Initiative",
    },
  },
  6: {
    name: "DonationReceipt",
    variables: {
      logoUrl: LOGO_URL,
      firstName: "John",
      amount: "$1,500.00",
      investmentName: "Green Energy Fund",
      date: "04/06/2026",
      exploreInvestmentsUrl: BROWSE_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
    },
  },
  7: {
    name: "ACHPaymentRequest",
    variables: {
      logoUrl: LOGO_URL,
      fullName: "John Doe",
      amount: "$1,500.00",
      investmentName: "Green Energy Fund",
      unsubscribeUrl: UNSUBSCRIBE_URL,
    },
  },
  8: {
    name: "DonationConfirmation",
    variables: {
      logoUrl: LOGO_URL,
      campaignName: "Green Energy Fund",
      campaignDescription: "A sustainable energy initiative focused on reducing carbon emissions through innovative solar and wind technologies.",
      campaignUrl: CAMPAIGN_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
      investorDisplayName: "Jane Smith",
      donorName: "John Doe",
      firstName: "John",
      investmentAmount: "$1,500.00",
    },
  },
  9: {
    name: "GrantReceived",
    variables: {
      logoUrl: LOGO_URL,
      firstName: "John",
      originalAmount: "$2,000.00",
      originalAmountAfter: "$1,800.00",
      investmentScenario: "Green Energy Fund",
      browseOpportunitiesUrl: BROWSE_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
    },
  },
  10: {
    name: "DAFReminderDay3",
    variables: {
      logoUrl: LOGO_URL,
      firstName: "John",
      amount: "$1,500.00",
      investmentScenario: "Green Energy Fund",
      dafProviderName: "Fidelity Charitable",
      dafProviderLink: "https://www.fidelitycharitable.org",
      dafName: "Fidelity Charitable",
      investmentOwnerName: "CataCap Foundation",
      investmentUrl: INVEST_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
    },
  },
  11: {
    name: "FoundationReminderWeek2",
    variables: {
      logoUrl: LOGO_URL,
      firstName: "John",
      amount: "$1,500.00",
      investmentScenario: "to <b>Green Energy Fund</b>",
      investmentOwnerName: "CataCap Foundation",
      investmentUrl: INVEST_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
    },
  },
  12: {
    name: "GroupInvestmentNotification",
    variables: {
      groupName: "Impact Investors Network",
      investmentName: "Green Energy Fund",
      targetAmount: "$500,000.00",
      investmentDescription: "A sustainable energy initiative focused on reducing carbon emissions.",
      groupPageUrl: GROUP_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
      firstName: "John",
    },
  },
  13: {
    name: "InvestmentActivityNotification",
    variables: {
      logoUrl: LOGO_URL,
      firstName: "John",
      lastName: "Doe",
      investmentName: "Green Energy Fund",
      returnedAmount: "$750.00",
      unsubscribeUrl: UNSUBSCRIBE_URL,
    },
  },
  14: {
    name: "FollowerInfluenceNotification",
    variables: {
      logoUrl: LOGO_URL,
      campaignName: "Green Energy Fund",
      campaignDescription: "A sustainable energy initiative focused on reducing carbon emissions.",
      campaignUrl: CAMPAIGN_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
      investorDisplayName: "Jane Smith",
      donorName: "John Doe",
      userFullName: "John Doe",
    },
  },
  15: {
    name: "CampaignOwnerFundingNotification",
    variables: {
      logoUrl: LOGO_URL,
      campaignName: "Green Energy Fund",
      campaignDescription: "A sustainable energy initiative focused on reducing carbon emissions.",
      campaignUrl: CAMPAIGN_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
      investorDisplayName: "Jane Smith",
      donorName: "John Doe",
      campaignFirstName: "John",
      investorName: "Jane Smith",
      investmentAmount: "$1,500.00",
      totalRaised: "$25,000.00",
      totalInvestors: "15",
      campaignPageUrl: CAMPAIGN_URL,
    },
  },
  16: {
    name: "InvestmentUnderReview",
    variables: {
      logoUrl: LOGO_URL,
      fullName: "John Doe",
      investmentName: "Green Energy Fund",
      preLaunchToolkitUrl: PRE_LAUNCH_URL,
      partnerBenefitsUrl: PARTNER_BENEFITS_URL,
      faqPageUrl: FAQ_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
    },
  },
  17: {
    name: "InvestmentQRCode",
    variables: {
      logoUrl: LOGO_URL,
      firstName: "John",
      investmentName: "Green Energy Fund",
      unsubscribeUrl: UNSUBSCRIBE_URL,
    },
  },
  18: {
    name: "InvestmentNoteMention",
    variables: {
      logoUrl: LOGO_URL,
      loggedInUserName: "Jane Smith",
      investmentName: "Green Energy Fund",
      noteText: "Please review the latest compliance documents for this investment.",
      stageChangeSection: "<p>Stage changed from <b>Under Review</b> to <b>Approved</b></p>",
    },
  },
  19: {
    name: "InvestmentApproved",
    variables: {
      logoUrl: LOGO_URL,
      date: "04/06/2026",
      investmentLink: INVESTMENT_URL,
      campaignName: "Green Energy Fund",
    },
  },
  20: {
    name: "ComplianceReviewNotification",
    variables: {
      logoUrl: LOGO_URL,
      campaignName: "Green Energy Fund",
    },
  },
  21: {
    name: "InvestmentPublished",
    variables: {
      logoUrl: LOGO_URL,
      date: "04/06/2026",
      campaignName: "Green Energy Fund",
    },
  },
  22: {
    name: "DisbursementRequest",
    variables: {
      logoUrl: LOGO_URL,
      investmentName: "Green Energy Fund",
      amount: "$5,000.00",
      date: "04/06/2026",
      disbursementUrl: DISBURSEMENT_URL,
    },
  },
  23: {
    name: "InvestmentSubmissionNotification",
    variables: {
      logoUrl: LOGO_URL,
      userFullName: "John Doe",
      ownerEmail: "john.doe@example.com",
      informationalEmail: "info@greenenergy.com",
      mobileNumber: "(555) 123-4567",
      addressLine1: "123 Main Street",
      investmentName: "Green Energy Fund",
      investmentDescription: "A sustainable energy initiative focused on reducing carbon emissions through innovative solar and wind technologies.",
      website: "https://greenenergyfund.com",
      investmentTypes: "Equity, Debt",
      terms: "5 Years",
      target: "$500,000.00",
      fundraisingCloseDate: "12/31/2026",
      themes: "Clean Energy, Sustainability",
      sdgs: "SDG 7: Affordable and Clean Energy, SDG 13: Climate Action",
      impactAssetsFundingStatus: "Pending",
      investmentRole: "Lead Investor",
      addressLine2Section: "<p><b>Address Line 2: </b>Suite 200</p>",
      citySection: "<p><b>City: </b>San Francisco</p>",
      stateSection: "<p><b>State: </b>California</p>",
      zipCodeSection: "<p><b>Zip Code: </b>94105</p>",
    },
  },
  24: {
    name: "PendingGrantNotification",
    variables: {
      logoUrl: LOGO_URL,
      formattedAmount: "$3,000.00",
      firstName: "John",
      lastName: "Doe",
      paymentMethod: "DAF - Fidelity Charitable",
    },
  },
  25: {
    name: "ACHFailureNotification",
    variables: {
      logoUrl: LOGO_URL,
      firstName: "John",
      lastName: "Doe",
      amount: "$1,500.00",
    },
  },
  26: {
    name: "ACHPaymentRequestAdmin",
    variables: {
      logoUrl: LOGO_URL,
      userFullName: "John Doe",
      userEmail: "john.doe@example.com",
      amount: "$1,500.00",
      investmentSection: "<p><b>Investment Name: </b>Green Energy Fund</p>",
    },
  },
  27: {
    name: "AssetDonationRequest",
    variables: {
      logoUrl: LOGO_URL,
      userFullName: "John Doe",
      userEmail: "john.doe@example.com",
      assetTypeSection: "<p><b>Asset Type: </b>Publicly Traded Securities</p>",
      amount: "$10,000.00",
      contactMethod: "Email",
      contactValue: "john.doe@example.com",
      investmentSection: "<p><b>Investment Name: </b>Green Energy Fund</p>",
    },
  },
  28: {
    name: "GroupJoinRequestNotification",
    variables: {
      logoUrl: LOGO_URL,
      groupName: "Impact Investors Network",
      userFullName: "Jane Smith",
      loginUrl: LOGIN_URL,
      groupUrl: GROUP_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
    },
  },
  29: {
    name: "DAFDonationInstructionsImpactAssets",
    variables: {
      firstName: "John",
      logoUrl: LOGO_URL,
      siteUrl: SITE_URL,
      formattedAmount: "$1,500.00",
      investmentScenario: "Green Energy Fund",
      dafProviderName: "ImpactAssets",
      dafProviderLink: "https://www.impactassets.org",
      donationRecipient: "CataCap Foundation",
    },
  },
  30: {
    name: "CampaignInvestmentNotification",
    variables: {
      logoUrl: LOGO_URL,
      campaignName: "Green Energy Fund",
      campaignDescription: "A sustainable energy initiative focused on reducing carbon emissions.",
      campaignUrl: CAMPAIGN_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
      investorDisplayName: "Jane Smith",
      donorName: "John Doe",
      firstName: "John",
    },
  },
  31: {
    name: "DAFReminderImpactAssetsDay3",
    variables: {
      logoUrl: LOGO_URL,
      firstName: "John",
      amount: "$1,500.00",
      investmentScenario: "Green Energy Fund",
      dafProviderName: "ImpactAssets",
      dafProviderLink: "https://www.impactassets.org",
      dafName: "ImpactAssets",
      investmentOwnerName: "CataCap Foundation",
      investmentUrl: INVEST_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
    },
  },
  32: {
    name: "DAFReminderImpactAssetsWeek2",
    variables: {
      logoUrl: LOGO_URL,
      firstName: "John",
      amount: "$1,500.00",
      investmentScenario: "Green Energy Fund",
      dafProviderName: "ImpactAssets",
      dafProviderLink: "https://www.impactassets.org",
      dafName: "ImpactAssets",
      investmentOwnerName: "CataCap Foundation",
      investmentUrl: INVEST_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
    },
  },
  33: {
    name: "DAFReminderWeek2",
    variables: {
      logoUrl: LOGO_URL,
      firstName: "John",
      amount: "$1,500.00",
      investmentScenario: "Green Energy Fund",
      dafProviderName: "Fidelity Charitable",
      dafProviderLink: "https://www.fidelitycharitable.org",
      dafName: "Fidelity Charitable",
      investmentOwnerName: "CataCap Foundation",
      investmentUrl: INVEST_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
    },
  },
  34: {
    name: "FoundationReminderDay3",
    variables: {
      logoUrl: LOGO_URL,
      firstName: "John",
      amount: "$1,500.00",
      investmentScenario: "to <b>Green Energy Fund</b>",
      investmentOwnerName: "CataCap Foundation",
      investmentUrl: INVEST_URL,
      unsubscribeUrl: UNSUBSCRIBE_URL,
    },
  },
  35: {
    name: "TwoFactorAuthentication",
    variables: {
      logoUrl: LOGO_URL,
      firstName: "John",
      verificationCode: "847293",
    },
  },
};

const DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTemplateFromDB(category: number): Promise<{ subject: string; body_html: string } | null> {
  const result = await pool.query(
    `SELECT subject, body_html FROM email_templates
     WHERE category = $1 AND status = 2 AND (is_deleted IS NULL OR is_deleted = false)
     LIMIT 1`,
    [category]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

function replaceVariables(content: string, variables: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(regex, value);
  }
  return result;
}

async function main() {
  console.log("=== Email Template Test Script (via Resend) ===");
  console.log(`Target email: ${TARGET_EMAIL}`);
  console.log(`Total categories to test: 35\n`);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (let category = 1; category <= 35; category++) {
    const config = templateConfigs[category];
    if (!config) {
      console.log(`[SKIP] Category ${category}: No config defined`);
      skipped++;
      continue;
    }

    const template = await getTemplateFromDB(category);
    if (!template) {
      console.log(`[SKIP] Category ${category} (${config.name}): Template not found in database`);
      skipped++;
      if (category < 35) await sleep(DELAY_MS);
      continue;
    }

    console.log(`[SENDING] Category ${category} (${config.name})...`);

    try {
      const subject = replaceVariables(template.subject || "", config.variables);
      const bodyHtml = replaceVariables(template.body_html || "", config.variables);

      const { data, error } = await resend.emails.send({
        from: "CataCap <support@catacap.org>",
        to: [TARGET_EMAIL],
        subject: `[Test Cat ${category}] ${subject}`,
        html: bodyHtml,
      });

      if (error) {
        console.error(`[FAIL] Category ${category} (${config.name}): ${error.message}`);
        failed++;
      } else {
        console.log(`[OK] Category ${category} (${config.name}): Sent successfully (id: ${data?.id})`);
        sent++;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[FAIL] Category ${category} (${config.name}): ${message}`);
      failed++;
    }

    if (category < 35) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Sent:    ${sent}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Total:   ${sent + skipped + failed}`);

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
