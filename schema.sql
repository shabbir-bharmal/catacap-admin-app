-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.account_balance_change_logs (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id text NOT NULL,
  old_value numeric,
  user_name text NOT NULL,
  new_value numeric,
  change_date timestamp without time zone NOT NULL,
  investment_name text,
  payment_type text,
  group_id integer,
  pending_grants_id integer,
  transaction_status text,
  reference text,
  campaign_id integer,
  comment text,
  asset_based_payment_request_id integer,
  zip_code text,
  fees numeric NOT NULL DEFAULT 0.0,
  gross_amount numeric NOT NULL DEFAULT 0.0,
  net_amount numeric NOT NULL DEFAULT 0.0,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT account_balance_change_logs_pkey PRIMARY KEY (id),
  CONSTRAINT FK_AccountBalanceChangeLogs_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id),
  CONSTRAINT FK_AccountBalanceChangeLogs_AssetBasedPaymentRequest_AssetBased FOREIGN KEY (asset_based_payment_request_id) REFERENCES public.asset_based_payment_requests(id)
);
CREATE TABLE public.ach_payment_requests (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  email text NOT NULL,
  full_name text NOT NULL,
  campaign_id integer,
  amount numeric NOT NULL,
  created_at timestamp without time zone NOT NULL,
  CONSTRAINT ach_payment_requests_pkey PRIMARY KEY (id)
);
CREATE TABLE public.api_error_logs (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  message text,
  stack_trace text,
  path text,
  method text,
  controller text,
  action text,
  parameters text,
  request_body text,
  user_name text,
  operating_system text,
  device_type text,
  browser text,
  country text,
  region text,
  client_ip text,
  proxy_ip_chain text,
  environment text,
  trace_id text,
  created_at timestamp without time zone NOT NULL,
  inner_exception_message text,
  inner_exception_stack_trace text,
  CONSTRAINT api_error_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.approvers (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL DEFAULT ''::text,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT approvers_pkey PRIMARY KEY (id),
  CONSTRAINT FK_ApprovedBy_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.archived_user_data (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  source_table text NOT NULL,
  record_id text NOT NULL,
  user_id text,
  days_old integer NOT NULL,
  record_json text NOT NULL,
  archived_at timestamp without time zone,
  deleted_at timestamp without time zone,
  CONSTRAINT archived_user_data_pkey PRIMARY KEY (id)
);
CREATE TABLE public.asset_based_payment_request_notes (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  request_id integer NOT NULL,
  note text,
  old_status text,
  new_status text,
  created_by character varying,
  created_at date NOT NULL,
  CONSTRAINT asset_based_payment_request_notes_pkey PRIMARY KEY (id),
  CONSTRAINT FK_AssetBasedPaymentRequestNotes_AssetBasedPaymentRequest_Reque FOREIGN KEY (request_id) REFERENCES public.asset_based_payment_requests(id)
);
CREATE TABLE public.asset_based_payment_requests (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id character varying NOT NULL,
  campaign_id integer,
  asset_type_id integer NOT NULL,
  asset_description text,
  approximate_amount numeric NOT NULL,
  received_amount numeric NOT NULL,
  contact_method text NOT NULL,
  contact_value text NOT NULL,
  status text NOT NULL,
  created_at timestamp without time zone NOT NULL,
  updated_at timestamp without time zone,
  updated_by character varying,
  reference text,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT asset_based_payment_requests_pkey PRIMARY KEY (id),
  CONSTRAINT FK_AssetBasedPaymentRequest_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id),
  CONSTRAINT FK_AssetBasedPaymentRequest_AssetType_AssetTypeId FOREIGN KEY (asset_type_id) REFERENCES public.asset_types(id)
);
CREATE TABLE public.asset_types (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  type text NOT NULL,
  CONSTRAINT asset_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.audit_logs (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  table_name text,
  record_id text,
  action_type text,
  old_values text,
  new_values text,
  changed_columns text,
  updated_by text,
  updated_at timestamp without time zone NOT NULL,
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.campaign_groups (
  campaigns_id integer NOT NULL,
  groups_id integer NOT NULL,
  CONSTRAINT campaign_groups_pkey PRIMARY KEY (campaigns_id, groups_id)
);
CREATE TABLE public.campaigns (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  name character varying,
  description text,
  themes text,
  sdgs text,
  investment_types text,
  terms text,
  minimum_investment text,
  website text,
  contact_info_full_name text,
  contact_info_address text,
  contact_info_email_address text,
  contact_info_phone_number text,
  target text,
  status text,
  image_file_name text,
  pdf_file_name text,
  logo_file_name text,
  approved_by text,
  group_for_private_access_id integer,
  is_active boolean,
  email_sends boolean,
  tile_image_file_name text,
  stage integer,
  property text,
  added_total_admin_raised integer,
  original_pdf_file_name text,
  created_date timestamp without time zone,
  modified_date timestamp without time zone,
  expected_total numeric,
  has_existing_investors boolean,
  mission_and_vision text,
  personalized_thank_you text,
  fundraising_close_date text,
  city text,
  contact_info_address_2 text,
  impact_assets_funding_status text,
  investment_role text,
  state text,
  user_id character varying,
  zip_code text,
  investment_informational_email text,
  referred_to_catacap text,
  network_description text,
  associated_fund_id integer,
  is_part_of_fund boolean NOT NULL DEFAULT false,
  country text,
  other_country_address text,
  featured_investment boolean NOT NULL DEFAULT false,
  debt_interest_rate numeric,
  debt_maturity_date date,
  debt_payment_frequency text,
  equity_security_type text,
  equity_target_return numeric,
  equity_valuation numeric,
  fund_term date,
  investment_type_category text,
  meta_description text,
  meta_title text,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT FK_Campaigns_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id),
  CONSTRAINT FK_Campaigns_Users_UserId FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.catacap_teams (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  designation text NOT NULL,
  description text NOT NULL,
  image_file_name text,
  linkedin_url text,
  is_management boolean NOT NULL,
  display_order integer NOT NULL,
  created_by character varying,
  modified_by character varying,
  created_at timestamp without time zone NOT NULL,
  modified_at timestamp without time zone,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT catacap_teams_pkey PRIMARY KEY (id),
  CONSTRAINT FK_CataCapTeam_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.completed_investment_details (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  date_of_last_investment date NOT NULL,
  campaign_id integer NOT NULL,
  investment_detail text,
  amount numeric,
  type_of_investment text,
  donors integer,
  themes text,
  created_by character varying NOT NULL,
  created_on timestamp without time zone NOT NULL,
  modified_on timestamp without time zone,
  site_configuration_id integer,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  investment_vehicle text,
  CONSTRAINT completed_investment_details_pkey PRIMARY KEY (id),
  CONSTRAINT FK_CompletedInvestmentsDetails_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.completed_investment_notes (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  completed_investment_id integer,
  note text,
  created_by character varying,
  created_at date NOT NULL,
  new_amount numeric NOT NULL DEFAULT 0.0,
  old_amount numeric NOT NULL DEFAULT 0.0,
  transaction_type integer,
  CONSTRAINT completed_investment_notes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.countries (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL,
  sort_order integer NOT NULL,
  code text NOT NULL DEFAULT ''::text,
  CONSTRAINT countries_pkey PRIMARY KEY (id)
);
CREATE TABLE public.daf_providers (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  provider_name text,
  provider_url text,
  is_active boolean NOT NULL,
  CONSTRAINT daf_providers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.disbursal_request_notes (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  disbursal_request_id integer,
  note text,
  created_by character varying,
  created_at date NOT NULL,
  CONSTRAINT disbursal_request_notes_pkey PRIMARY KEY (id),
  CONSTRAINT FK_DisbursalRequestNotes_DisbursalRequest_DisbursalRequestId FOREIGN KEY (disbursal_request_id) REFERENCES public.disbursal_requests(id)
);
CREATE TABLE public.disbursal_requests (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id character varying NOT NULL,
  campaign_id integer,
  role text,
  mobile text,
  distributed_amount numeric NOT NULL,
  impact_assets_funding_previously text,
  investment_remain_open text,
  receive_date date,
  pitch_deck text,
  investment_document text,
  created_at timestamp without time zone NOT NULL,
  investment_document_name text,
  pitch_deck_name text,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  quote text,
  status integer NOT NULL DEFAULT 1,
  CONSTRAINT disbursal_requests_pkey PRIMARY KEY (id),
  CONSTRAINT FK_DisbursalRequest_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.ef_migrations_history (
  migration_id character varying NOT NULL,
  product_version character varying NOT NULL,
  CONSTRAINT ef_migrations_history_pkey PRIMARY KEY (migration_id)
);
CREATE TABLE public.email_template_variables (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  category integer NOT NULL,
  variable_name text NOT NULL,
  email_template_id integer NOT NULL,
  CONSTRAINT email_template_variables_pkey PRIMARY KEY (id),
  CONSTRAINT FK_EmailTemplateVariable_EmailTemplate_EmailTemplateId FOREIGN KEY (email_template_id) REFERENCES public.email_templates(id)
);
CREATE TABLE public.email_templates (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  category integer NOT NULL,
  status integer NOT NULL,
  is_deleted boolean NOT NULL,
  created_by character varying,
  modified_by character varying,
  created_at timestamp without time zone NOT NULL,
  modified_at timestamp without time zone,
  receiver text,
  trigger_action text,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  CONSTRAINT email_templates_pkey PRIMARY KEY (id),
  CONSTRAINT FK_EmailTemplate_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.event_registrations (
  id integer NOT NULL DEFAULT nextval('event_registrations_id_seq'::regclass),
  event_slug text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  referred_by text,
  created_at timestamp without time zone DEFAULT now(),
  guest_name text,
  CONSTRAINT event_registrations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.events (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  registration_link text,
  event_time text,
  event_date date NOT NULL,
  status boolean NOT NULL,
  created_by character varying,
  modified_by character varying,
  created_at timestamp without time zone NOT NULL,
  modified_at timestamp without time zone,
  image text,
  image_file_name text,
  duration text,
  type text,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT events_pkey PRIMARY KEY (id),
  CONSTRAINT FK_Event_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.faqs (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  category integer NOT NULL,
  question text,
  answer text,
  status boolean NOT NULL,
  display_order integer NOT NULL,
  created_by character varying,
  modified_by character varying,
  created_at timestamp without time zone NOT NULL,
  modified_at timestamp without time zone,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT faqs_pkey PRIMARY KEY (id),
  CONSTRAINT FK_Faq_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.form_drafts (
  id integer NOT NULL DEFAULT nextval('form_drafts_id_seq'::regclass),
  token character varying NOT NULL UNIQUE,
  email text,
  current_step integer DEFAULT 1,
  form_data text NOT NULL,
  early_lead_sent boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT form_drafts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.form_submission_notes (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  form_submission_id integer,
  note text,
  old_status text,
  new_status text,
  created_by character varying,
  created_at date NOT NULL,
  CONSTRAINT form_submission_notes_pkey PRIMARY KEY (id),
  CONSTRAINT FK_FormSubmissionNotes_FormSubmission_FormSubmissionId FOREIGN KEY (form_submission_id) REFERENCES public.form_submissions(id)
);
CREATE TABLE public.form_submissions (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  form_type integer NOT NULL,
  first_name text,
  last_name text,
  email text,
  description text,
  created_at timestamp without time zone NOT NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  target_raise_amount text,
  launch_partners text,
  self_raise_amount_range text,
  status integer NOT NULL DEFAULT 1,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  CONSTRAINT form_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT FK_FormSubmission_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.group_account_balances (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id character varying NOT NULL DEFAULT ''::character varying,
  group_id integer NOT NULL,
  balance numeric NOT NULL,
  last_updated timestamp without time zone,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT group_account_balances_pkey PRIMARY KEY (id),
  CONSTRAINT FK_GroupAccountBalance_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id),
  CONSTRAINT FK_GroupAccountBalance_AspNetUsers_UserId FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT FK_GroupAccountBalance_Groups_GroupId FOREIGN KEY (group_id) REFERENCES public.groups(id)
);
CREATE TABLE public.groups (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text,
  website text,
  description text,
  is_approuve_required boolean,
  owner_id character varying,
  is_deactivated boolean NOT NULL DEFAULT false,
  picture_file_name text,
  identifier text,
  original_balance numeric,
  is_corporate_group boolean NOT NULL DEFAULT false,
  is_private_group boolean NOT NULL DEFAULT false,
  champions_and_catalysts text,
  leaders text,
  background_picture_file_name text,
  created_at timestamp without time zone,
  modified_at timestamp without time zone,
  our_why_description text,
  video_link text,
  did_you_know text,
  featured_group boolean NOT NULL DEFAULT false,
  group_themes text,
  meta_description text,
  meta_title text,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  sdgs text,
  CONSTRAINT groups_pkey PRIMARY KEY (id),
  CONSTRAINT FK_Groups_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.investment_feedbacks (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id character varying NOT NULL,
  themes text,
  additional_themes text,
  interested_investment_type text,
  risk_tolerance integer,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT investment_feedbacks_pkey PRIMARY KEY (id),
  CONSTRAINT FK_InvestmentFeedback_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.investment_notes (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  campaign_id integer,
  note text,
  created_by character varying,
  created_at date NOT NULL,
  new_status text,
  old_status text,
  CONSTRAINT investment_notes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.investment_requests (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  current_step integer NOT NULL,
  status integer NOT NULL,
  country text,
  user_id character varying,
  website text,
  organization_name text,
  currently_raising boolean NOT NULL,
  investment_types text,
  investment_themes text,
  theme_description text,
  capital_raised text,
  referenceable_investors text,
  has_donor_commitment boolean NOT NULL,
  soft_circled_amount numeric NOT NULL,
  timeline text,
  campaign_goal numeric NOT NULL,
  role text,
  referral_source text,
  logo_file_name text,
  hero_image_file_name text,
  pitch_deck_file_name text,
  investment_terms text,
  why_back_your_investment text,
  modified_by character varying,
  created_at timestamp without time zone NOT NULL,
  modified_at timestamp without time zone,
  is_deleted boolean NOT NULL,
  hero_image text,
  logo text,
  pitch_deck text,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  CONSTRAINT investment_requests_pkey PRIMARY KEY (id),
  CONSTRAINT FK_InvestmentRequest_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.investment_tag_mappings (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  tag_id integer NOT NULL,
  campaign_id integer NOT NULL,
  CONSTRAINT investment_tag_mappings_pkey PRIMARY KEY (id),
  CONSTRAINT FK_InvestmentTagMapping_InvestmentTag_TagId FOREIGN KEY (tag_id) REFERENCES public.investment_tags(id)
);
CREATE TABLE public.investment_tags (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  tag text NOT NULL,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT investment_tags_pkey PRIMARY KEY (id),
  CONSTRAINT FK_InvestmentTag_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.investment_types (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text,
  CONSTRAINT investment_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.leader_groups (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id character varying NOT NULL,
  group_id integer NOT NULL,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT leader_groups_pkey PRIMARY KEY (id),
  CONSTRAINT FK_LeaderGroup_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.module_access_permissions (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  module_id integer NOT NULL,
  role_id character varying NOT NULL,
  manage boolean NOT NULL,
  delete boolean NOT NULL,
  updated_by character varying NOT NULL,
  created_at timestamp without time zone NOT NULL,
  updated_at timestamp without time zone,
  CONSTRAINT module_access_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT FK_ModuleAccessPermission_Module_ModuleId FOREIGN KEY (module_id) REFERENCES public.modules(id)
);
CREATE TABLE public.modules (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  created_at timestamp without time zone NOT NULL,
  category text,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT modules_pkey PRIMARY KEY (id)
);
CREATE TABLE public.news (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  title text NOT NULL,
  description text,
  news_type_id integer,
  audience_id integer,
  theme_id integer,
  image_file_name text,
  news_link text,
  status boolean NOT NULL,
  created_by character varying,
  modified_by character varying,
  news_date date,
  created_at timestamp without time zone NOT NULL,
  modified_at timestamp without time zone,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT news_pkey PRIMARY KEY (id),
  CONSTRAINT FK_News_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id),
  CONSTRAINT FK_News_SiteConfiguration_AudienceId FOREIGN KEY (audience_id) REFERENCES public.site_configurations(id),
  CONSTRAINT FK_News_SiteConfiguration_NewsTypeId FOREIGN KEY (news_type_id) REFERENCES public.site_configurations(id)
);
CREATE TABLE public.pending_grant_notes (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  pending_grant_id integer,
  note text,
  old_status text,
  new_status text,
  created_by character varying,
  created_at date NOT NULL,
  CONSTRAINT pending_grant_notes_pkey PRIMARY KEY (id),
  CONSTRAINT FK_PendingGrantNotes_PendingGrants_PendingGrantId FOREIGN KEY (pending_grant_id) REFERENCES public.pending_grants(id)
);
CREATE TABLE public.pending_grants (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id character varying NOT NULL,
  amount text NOT NULL,
  daf_provider text NOT NULL,
  daf_name text,
  campaign_id integer,
  invested_sum character varying,
  status character varying,
  created_date timestamp without time zone,
  modified_date timestamp without time zone,
  amount_after_fees numeric,
  grant_amount numeric,
  total_invested_amount numeric,
  rejected_by character varying,
  rejection_date timestamp without time zone,
  rejection_memo text,
  reference text,
  address text,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT pending_grants_pkey PRIMARY KEY (id),
  CONSTRAINT FK_PendingGrants_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.raise_money_applications (
  id integer NOT NULL DEFAULT nextval('raise_money_applications_id_seq'::regclass),
  first_name text NOT NULL,
  last_name text,
  contact_email text NOT NULL,
  investment_info_email text NOT NULL,
  phone text NOT NULL DEFAULT ''::text,
  country text NOT NULL DEFAULT ''::text,
  investment_name text NOT NULL DEFAULT ''::text,
  website text NOT NULL DEFAULT ''::text,
  fundraising_goal text NOT NULL DEFAULT ''::text,
  expected_total text NOT NULL DEFAULT ''::text,
  timeline text NOT NULL DEFAULT ''::text,
  themes text,
  sdgs text,
  investment_types text,
  role text,
  referral_source text,
  received_funding_before text,
  status text NOT NULL DEFAULT 'pending'::text,
  crm_synced boolean NOT NULL DEFAULT false,
  crm_sync_error text,
  submitted_at timestamp without time zone DEFAULT now(),
  about_investment text,
  mission_vision text,
  thank_you_message text,
  network_description text,
  company_description text,
  expected_close_date text,
  address text,
  address2 text,
  city text,
  state text,
  zip_code text,
  other_country_address text,
  profile_image_base64 text,
  tile_image_base64 text,
  profile_image_file_name text,
  tile_image_file_name text,
  logo_base64 text,
  hero_image_base64 text,
  pitch_deck_base64 text,
  logo_file_name text,
  hero_image_file_name text,
  pitch_deck_file_name text,
  stage integer DEFAULT 5,
  CONSTRAINT raise_money_applications_pkey PRIMARY KEY (id)
);
CREATE TABLE public.recommendations (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_email text,
  user_full_name text,
  campaign_id integer,
  status text,
  amount numeric,
  date_created timestamp without time zone,
  pending_grants_id integer,
  rejected_by character varying,
  rejection_date timestamp without time zone,
  rejection_memo text,
  user_id character varying,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT recommendations_pkey PRIMARY KEY (id),
  CONSTRAINT FK_Recommendations_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.requests (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  request_owner_id character varying,
  user_to_follow_id character varying,
  group_to_follow_id integer,
  status text,
  created_at timestamp without time zone,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT requests_pkey PRIMARY KEY (id),
  CONSTRAINT FK_Requests_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.return_details (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  return_master_id integer NOT NULL,
  user_id character varying NOT NULL,
  investment_amount numeric NOT NULL,
  percentage_of_total_investment numeric NOT NULL,
  return_amount numeric NOT NULL,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT return_details_pkey PRIMARY KEY (id),
  CONSTRAINT FK_ReturnDetails_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.return_masters (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  campaign_id integer NOT NULL,
  created_by character varying NOT NULL,
  return_amount numeric NOT NULL,
  total_investors integer,
  total_investment_amount numeric NOT NULL,
  memo_note text,
  status text,
  private_debt_start_date date,
  private_debt_end_date date,
  post_date date NOT NULL,
  created_on timestamp without time zone NOT NULL,
  CONSTRAINT return_masters_pkey PRIMARY KEY (id)
);
CREATE TABLE public.role_claims (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  role_id character varying NOT NULL,
  claim_type text,
  claim_value text,
  CONSTRAINT role_claims_pkey PRIMARY KEY (id)
);
CREATE TABLE public.roles (
  id character varying NOT NULL,
  name character varying,
  normalized_name character varying,
  concurrency_stamp text,
  is_super_admin boolean NOT NULL DEFAULT false,
  CONSTRAINT roles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.scheduled_email_logs (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  pending_grant_id integer NOT NULL,
  user_id character varying NOT NULL,
  reminder_type text,
  error_message text,
  sent_date timestamp without time zone NOT NULL,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT scheduled_email_logs_pkey PRIMARY KEY (id),
  CONSTRAINT FK_ScheduledEmailLogs_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id),
  CONSTRAINT FK_ScheduledEmailLogs_PendingGrants_PendingGrantId FOREIGN KEY (pending_grant_id) REFERENCES public.pending_grants(id)
);
CREATE TABLE public.scheduler_configurations (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  job_name text NOT NULL UNIQUE,
  description text,
  hour integer NOT NULL DEFAULT 0,
  minute integer NOT NULL DEFAULT 0,
  timezone text NOT NULL DEFAULT 'America/New_York',
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp without time zone NOT NULL DEFAULT NOW(),
  updated_at timestamp without time zone NOT NULL DEFAULT NOW(),
  CONSTRAINT scheduler_configurations_pkey PRIMARY KEY (id),
  CONSTRAINT scheduler_configurations_hour_check CHECK (hour >= 0 AND hour <= 23),
  CONSTRAINT scheduler_configurations_minute_check CHECK (minute >= 0 AND minute <= 59)
);

INSERT INTO public.scheduler_configurations (job_name, description, hour, minute, timezone)
VALUES
  ('SendReminderEmail', 'Sends reminder emails for pending grants at Day 3 and Week 2 intervals', 8, 0, 'America/New_York'),
  ('DeleteArchivedUsers', 'Archives and deletes soft-deleted records older than the configured retention period', 2, 0, 'America/New_York'),
  ('DeleteTestUsers', 'Soft-deletes test user accounts and all associated data (restorable from Archived Records)', 18, 0, 'Asia/Kolkata')
ON CONFLICT (job_name) DO NOTHING;

CREATE TABLE public.scheduler_logs (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  start_time timestamp without time zone NOT NULL,
  end_time timestamp without time zone NOT NULL,
  day3_email_count integer NOT NULL,
  week2_email_count integer NOT NULL,
  error_message text,
  job_name text,
  CONSTRAINT scheduler_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.sdgs (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL DEFAULT ''::text,
  CONSTRAINT sdgs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.site_configurations (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  type text NOT NULL DEFAULT ''::text,
  additional_details text,
  image text,
  image_name text,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT site_configurations_pkey PRIMARY KEY (id),
  CONSTRAINT FK_SiteConfiguration_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.slugs (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  reference_id integer NOT NULL,
  type integer NOT NULL,
  value text,
  created_at timestamp without time zone NOT NULL,
  CONSTRAINT slugs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.system_values (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  value text NOT NULL,
  CONSTRAINT system_values_pkey PRIMARY KEY (id)
);
CREATE TABLE public.testimonials (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  display_order integer NOT NULL,
  perspective_text text,
  description text,
  metrics text,
  role text,
  organization_name text,
  user_id character varying,
  created_at timestamp without time zone NOT NULL,
  status boolean NOT NULL DEFAULT false,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT testimonials_pkey PRIMARY KEY (id),
  CONSTRAINT FK_Testimonial_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.themes (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  mandatory boolean NOT NULL,
  image_file_name text,
  description text,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT themes_pkey PRIMARY KEY (id),
  CONSTRAINT FK_Themes_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.user_claims (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id character varying NOT NULL,
  claim_type text,
  claim_value text,
  CONSTRAINT user_claims_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_investments (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id character varying,
  campaign_name text,
  payment_type text,
  log_triggered boolean,
  campaign_id integer,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT user_investments_pkey PRIMARY KEY (id),
  CONSTRAINT FK_UserInvestments_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.user_logins (
  login_provider character varying NOT NULL,
  provider_key character varying NOT NULL,
  provider_display_name text,
  user_id character varying NOT NULL,
  CONSTRAINT user_logins_pkey PRIMARY KEY (login_provider, provider_key)
);
CREATE TABLE public.user_notifications (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  url_to_redirect text NOT NULL,
  is_read boolean NOT NULL,
  target_user_id character varying NOT NULL,
  picture_file_name text,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT user_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT FK_UsersNotifications_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.user_roles (
  user_id character varying NOT NULL,
  role_id character varying NOT NULL,
  discriminator text NOT NULL,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean,
  CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id),
  CONSTRAINT FK_AspNetUserRoles_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);
CREATE TABLE public.user_stripe_customer_mappings (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  customer_id character varying NOT NULL,
  card_detail_token text,
  CONSTRAINT user_stripe_customer_mappings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_stripe_transaction_mappings (
  id uuid NOT NULL,
  user_id uuid,
  transaction_id character varying NOT NULL,
  status character varying NOT NULL,
  amount numeric NOT NULL,
  country text,
  zip_code text,
  requested_data text NOT NULL,
  response_data text NOT NULL,
  created_date timestamp without time zone,
  modified_date timestamp without time zone,
  webhook_execution_date timestamp without time zone,
  webhook_response_data text,
  webhook_status text,
  CONSTRAINT user_stripe_transaction_mappings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_tokens (
  user_id character varying NOT NULL,
  login_provider character varying NOT NULL,
  name character varying NOT NULL,
  value text,
  CONSTRAINT user_tokens_pkey PRIMARY KEY (user_id, login_provider, name)
);
CREATE TABLE public.users (
  id character varying NOT NULL,
  first_name text,
  last_name text,
  account_balance numeric,
  address text,
  is_approuve_required boolean,
  email_from_groups_on boolean,
  email_from_users_on boolean,
  is_active boolean,
  user_name character varying,
  normalized_user_name character varying,
  email character varying,
  normalized_email character varying,
  email_confirmed boolean NOT NULL,
  password_hash text,
  security_stamp text,
  concurrency_stamp text,
  phone_number text,
  phone_number_confirmed boolean NOT NULL,
  two_factor_enabled boolean NOT NULL,
  lockout_end timestamp with time zone,
  lockout_enabled boolean NOT NULL,
  access_failed_count integer NOT NULL,
  is_user_hidden boolean,
  date_created timestamp without time zone,
  picture_file_name text,
  opt_out_email_notifications boolean,
  is_free_user boolean NOT NULL DEFAULT false,
  is_anonymous_investment boolean,
  consent_to_show_avatar boolean NOT NULL DEFAULT true,
  is_exclude_user_balance boolean NOT NULL DEFAULT false,
  alternate_email text,
  zip_code text,
  deleted_at timestamp without time zone,
  deleted_by character varying,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT FK_AspNetUsers_AspNetUsers_DeletedBy FOREIGN KEY (deleted_by) REFERENCES public.users(id)
);