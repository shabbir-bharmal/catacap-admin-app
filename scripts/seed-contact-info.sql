-- Seed Contact Info records into site_configurations table
-- Run this manually to populate the Contact Info tab with default values

-- Emails
INSERT INTO site_configurations (key, value, type, additional_details) VALUES ('support', 'support@catacap.org', 'ContactInfo-emails', 'General support email address');
INSERT INTO site_configurations (key, value, type, additional_details) VALUES ('empowerHer', 'empowerher@catacap.org', 'ContactInfo-emails', 'EmpowerHer program email');
INSERT INTO site_configurations (key, value, type, additional_details) VALUES ('rsvpNotification', 'ken@catacap.org', 'ContactInfo-emails', 'Receives RSVP event notifications');
INSERT INTO site_configurations (key, value, type, additional_details) VALUES ('adminNotification', 'ken@catacap.org', 'ContactInfo-emails', 'Receives admin notifications');
INSERT INTO site_configurations (key, value, type, additional_details) VALUES ('achFailureNotification', 'catacap-admin@catacap.org', 'ContactInfo-emails', 'Receives ACH payment failure alerts');
INSERT INTO site_configurations (key, value, type, additional_details) VALUES ('defaultFromAddress', 'support@catacap.org', 'ContactInfo-emails', 'Default sender address for outgoing emails');
INSERT INTO site_configurations (key, value, type, additional_details) VALUES ('eventFromAddress', 'jenny@catacap.org', 'ContactInfo-emails', 'Sender address for event-related emails');
INSERT INTO site_configurations (key, value, type, additional_details) VALUES ('impactAssetsClientService', 'clientservice@impactassets.org', 'ContactInfo-emails', 'Impact Assets client service contact');

-- People
INSERT INTO site_configurations (key, value, type, additional_details) VALUES ('emailSenderName', 'CataCap Support', 'ContactInfo-people', 'Display name for general outgoing emails');
INSERT INTO site_configurations (key, value, type, additional_details) VALUES ('eventSenderName', 'Jenny Quintana', 'ContactInfo-people', 'Display name for event-related emails');
INSERT INTO site_configurations (key, value, type, additional_details) VALUES ('emailSignoff', 'Jenny Quintana', 'ContactInfo-people', 'Name used in email sign-off');
INSERT INTO site_configurations (key, value, type, additional_details) VALUES ('empowerHerCeoMeagan', 'Meagan Pitcher', 'ContactInfo-people', 'EmpowerHer CEO name (Meagan)');
INSERT INTO site_configurations (key, value, type, additional_details) VALUES ('empowerHerCeoJocelyn', 'Jocelyn Quarrell', 'ContactInfo-people', 'EmpowerHer CEO name (Jocelyn)');

-- Organization
INSERT INTO site_configurations (key, value, type, additional_details) VALUES ('name', 'CataCap', 'ContactInfo-organization', 'Organization display name');
INSERT INTO site_configurations (key, value, type, additional_details) VALUES ('legalEntity', 'Impactree Foundation', 'ContactInfo-organization', 'Legal entity name for official documents');
INSERT INTO site_configurations (key, value, type, additional_details) VALUES ('address', '3749 Buchanan Street, Unit 475207, San Francisco, CA 94147', 'ContactInfo-organization', 'Organization mailing address');
INSERT INTO site_configurations (key, value, type, additional_details) VALUES ('website', 'https://www.catacap.org', 'ContactInfo-organization', 'Organization website URL');
