# Messenger Platform / Instagram Messaging error codes (snapshot)

> Snapshot for compliance reference. Source: https://developers.facebook.com/docs/messenger-platform/error-codes/
> Fetched: 2026-09-15 (IST). Meta's live page is canonical; this copy is for audit evidence.

Build with us

Docs

Blog

Resources

Developer centers

Login

Messenger Platform

Messenger Platform

Business Messaging

Messenger Platform

Messenger Platform

Overview

Rate Limits

Create an app

Get Started

Get Started

Quick Start

Sample App

Webhooks

Webhooks

Webhook Events

Webhook Events

group_feed

messages

messaging_account_linking

message_deliveries

message_echoes

message_edits

messaging_game_plays

messaging_handovers

messaging_optins

messaging_policy_enforcement

messaging_postbacks

message_reactions

message_reads

messaging_referrals

response_feedback

send_cart

standby

Calling

Calling

Webhooks

Consumer to Business Calling

Consumer to Business Calling

Call flow

Accept a call

Reject or end a call

Business to Consumer Calling

Business to Consumer Calling

Call flow

Check permissions

Initiate a call

Video Calling

Call Settings

Metrics

Call Audio CTA

JS Integration

Appendix

Conversation Routing

Conversation Routing

Messenger Lead Generation Ads

Discovery & Engagement

Discovery & Engagement

Lead Generations Ads UI

m.me Links

Private Replies

Welcome Screen

Messenger Profile API

Messenger Profile API

ice_breakers

whitelisted_domains

commands

Supported Locales

Ads

Ads

Welcome Message Flows

Messaging

Messaging

Conversation Components

Conversation Components

Personas

Sender Actions

Saving Assets

Sticker API

Buttons

Buttons

URL button

Postback button

Call button

Log in button

Log out button

Game play button

Persistent Menu

Quick Replies

Marketing Messages

Marketing Messages

Overview

Onboard Businesses

Get Subscription Tokens

Send Messages

Send Messages

Quick Replies

Postback

Measure Performance

Grow Marketing Messages Audience

FAQ

API Reference

API Reference

Generic

Button

Text

Media

Product

Receipt

Coupon

Changelog

Additional Resources

Additional Resources

Send Messages via MAPI

Utility Messages

Templates

Templates

Button Template

Coupon Template

Customer Feedback Template

Generic Template

Image Grid Template

Instant Form Template

Media Template

Product Template

Receipt Template

Structured Information Template

Conversations API

Catalog-Powered Shopping Features

Webview

Webview

Add the Messenger Extensions SDK

Share Webview Content

Manage Permissions

Get User & Conversation Context

Get Supported Features

IDs & Profile

IDs & Profile

Account Linking

Profile Information

Custom Labels

Natural Language Processing

Analytics & Feedback

Analytics & Feedback

Messaging Insights API

App Events

Messaging Feature Review API

Policy & Usage Guidelines

General Best Practices

App Review

Support Resources

FAQ

Resources

API Reference

Add a label to a thread for a Messenger page

Manage custom labels for a page

Manage custom user settings for a Messenger page

Messenger/IGv2 Page Moderate Conversations

Page Calls

Page Messaging Feature Review

Page Messenger Call Permissions

Page Messenger Call Settings

Page Status API

Retrieve a Messenger bot persona

Retrieve a thread label for a Messenger page

Retrieve personas for a Messenger page

Error Codes

Changelog

Docs

Overview

Common Error Codes

# Common Error Codes

Updated: Jun 25, 2026

Copy for LLM

View as Markdown

The following table contains a list of common error codes you may encounter when using the Messenger Platform.

## Example Error Response

{
"error": {
"message": "Invalid OAuth access token.",
"type": "OAuthException",
"code": 190,
"error_subcode": 1234567,
"fbtrace_id": "BLBz/WZt8dN"
}
}

|
Code – Subcode
|
Message
|
Possible Solution

|

1 – 99

|

An unknown error occurred.

|

Missing permissions can cause this issue.

Your app may need Advanced Access, Business Verification, or permissions.

|

1 – 1357046

|

Received invalid JSON reply.

|

The developer is sending a batch of messages containing 2 text messages and 1 video. The messages are all sent successfully, but the endpoint returns an error. Is the object that they are sending causing the problem? There is a system delay in returning the error message.

|

2

|

An unexpected error has occurred. Please retry your request later.

|

When experiencing issues making calls to the Meta social graph, you can check the status of the Meta Developer Platform⁠ to determine if there are issues affecting API calls. You might also receive this error if a customer has blocked your business from messaging him or her.

|

2 – 2018344

|

Service temporarily unavailable

Privacy ToS not accepted – To use the inbox label API, you need to accept the privacy ToS. Click the link to accept. https://www.facebook.com/100841475479486/inbox/page_contact_tos/

|

The Page admin must accept the Privacy Terms of Service for Custom Labels.

|

4

|

Rate Limit error: Application request limit reached.

Rate Limit error: Too many send requests to phone numbers

|

Pause requests until current requests drop below the limit.

|

4 – 2018354

|

Marketing Messages – There has to be a minimum delay between 2 notifications for the given notification

|

When a Marketing Message bypasses the frequency set in the notification_messages_frequency field.

This error code will not cause your app to be flagged or blocked for abuse. It is okay to ignore this error, but ideally you should keep track of which users you have sent messages to per the agreed cadence, so you can exclude those users from the next batch of broadcast messages.

|

9 – 2018352

|

User is performing too many actions

|

When the Marketing Message opt–in request limit has been exceeded.

|

10

|

No Permission For Pages Associated to Instant Games.

|

The User Profile API is not available for PSIDs associated with Instant Game Pages.

|

10 – 1404170

|

Application does not have permission for this action

|

When the Page is temporarily restricted from sending Marketing Message opt–in requests.

|

10 – 1893015

|

(#10) This user has currently stopped notification messages for this topic

|

When the Page sends a Marketing Message after the user clicks “Stop these messages”.

|

10 – 2018336

|

User Thread Impact

|

To determine whether there is user thread impact, invoke the User Level Menu API. If you get a valid response, there is no impact. If you get an error message with code 10, subcode 2018336, the thread is impacted.

|

10 – 2534022

|

This message is sent outside of allowed window.

|

Apps can only send a message to a customer within 24 hours of receiving the customer’s message.

|

10 – 2534077

|

Cannot verify the connection between the IG account, the logged in user and the page. Please try reconnecting or verify if the user needs 2–factor authentication.

|

The page and IG account are not linked or 2–factor authentication is not enabled. Add a link to the 2–factor authentication document (It might be in the help center). Advise the user to check the linkage and perhaps link and unlink the page and the IG account to fix the issue.

|

10 – 2018278

|

This message is sent outside of allowed window. Learn more about the new policy here.

|

|

10 – 2018065

|

This message is sent outside of allowed window. You need News Messaging permission to be able to do it.

|

|

10 – 2018108

|

They can’t receive your messages right now.

|

|

10 – 1893063

|

You are temporarily restricted from sending messages.

|

The Page is temporarily restricted from sending messages due to activity that doesn’t follow our Messaging Policies. Learn more⁠ about when and why we restrict messaging.

|

100

|

Bad Parameter Error: Invalid FBID.

Bad Parameter Error: No matching user found.

notification_messages_token is invalid

notification_messages_token has expired

|

Check to make sure the ID or token you are using is valid.

|

100 – 33

|

Unsupported get request. Object with ID * does not exist, cannot
be loaded due to missing permissions, or does not support this
operation.

|

Make sure the ID in your request exists and that your app has the proper permissions to access it.

|

100 – 2018001

|

No matching user found

|

|

100 – 2018008

|

Failed to fetch the file from the url. Check that the URL is valid, with a valid SSL certificate, valid file size, and that the server is responding fast enough to avoid timeouts.

|

|

100 – 2018014

|

Cannot send both message and state at the same time.

|

|

100 – 2018047

|

Upload attachment failure. A common way to trigger this error is that the provided media type does not match type of file provided int the URL.

|

|

100 – 2018074

|

Possible invalid ID or you do not own the attachment.

|

Please view Document Source: Attachment Upload API

|

100 – 2018109

|

Attachment size exceeds allowable limit

|

|

100 – 2018164

|

Incorrect App ID.

|

|

100 – 2018294

|

Video upload timed out or video is corrupted. Note that if the video can’t be fetched within 75 seconds, it will time out.

|

|

100 – 2018320

|

Invalid product id

|

Check to make sure the product ID you are using in your Product Template is a valid ID and that your app has permission to access it.

|

100 – 2018328

|

Product template is not supported below version 8. Use API version 8 or higher to use product templates.

|

|

100 – 2534013

|

The page is not linked to an Instagram account

|

The Page ID used in your API calls must be for the Facebook Page linked to your Instagram Professional account.

|

100 – 2534014

|

No matching Instagram user

|

Check to make sure the ID you are using is a valid Instagram–scoped ID. Instagram User ID are not supported.

|

100 – 2534015

|

Invalid message data

|

Make sure that the type of data you are sending in your message is allowed for your message type.

|

100 – 2534025

|

The comment is invalid for a private reply

|

Make sure that the type of data you are sending in your private reply is allowed.

|

100 – 2534029

|

The business has been blocked from sending messages via the IG Messaging API

|

Check to make sure you do not have any policy violations that must be rectified before you can send messages using the Messenger Platform.

|

100 – 2534037

|

The action is invalid since it’s not the thread owner.

|

You do not have permission to perform the action on this conversation. Check that your app has the correct permissions and access tokens to manage the conversation.

|

190

|

Access Token Error: Invalid OAuth access token.

|

|

200

|

Permission Error: Cannot message users who are not admins, developers or testers of the app until pages_messaging permission is reviewed and the app is live.

|

|

200 – 1545041

|

Message Not Sent: This person isn’t available right now.

|

|

200 – 2018021

|

Requires phone matching access fee to be paid by this page unless the recipient user is an admin, developer, or tester of the app.

|

|

200 – 2018027

|

Cannot message users who are not admins, developers or testers of the app until pages_messaging_phone_number permission is reviewed and the app is live.

|

|

200 – 2018028

|

Cannot message users who are not admins, developers or testers of the app until pages_messaging permission is reviewed and the app is live.

|

|

200 – 2534041

|

The account owner has disabled access to instagram direct messages.

|

The owner of the Instagram Professional account has revoked your app’s access.

|

551

|

User Block Error: This person isn’t receiving messages from you right now.

|

|

551 – 1545041

|

This person isn’t available right now.

|

|

613 – 1893016

|

Scope of service exceeded: You may not send multiple opt–in requests with the same topic to a user.

|

When a Page sends more than 1 opt–in request to the user on the same topic.

If a user receives this type of error through opting–in via Send to Messenger, you will need to inform the user on your website that an opt–in request was already sent to Messenger

|

613 – 2018338

|

Warning! You are engaging in behavior that may be considered bothersome or abusive by users. You must significantly decrease the rate at which you are sending messages using message tags to this person. Further misuse of API features may result in messaging restrictions being placed on your Page

|

|

613 – 2534040

|

Calls to this api have exceeded the rate limit.

|

Your app has reached the rate limit. Pause API calls and try again later.

|

2022

|

The ability to send commerce messages has been temporarily disabled. This is the result of a feature limit placed after a policy violation.

|

|

10303

|

Account Linking Error: Invalid account_linking_token.

|

|

24001

|

User canceled payment flow

|

|

24002

|

Payment request cannot be processed due to missing privacy url

|

|

24005

|

Failed to get user ID

|

|

36103

|

To onboard creator accounts during Instagram phased rollout

|

Call the Conversation API with the page access token to check their eligibility: if the API responds with error code 36103 with the message “This IG account is not eligible for API yet” the business is not yet eligible. Source Document: Messenger API support for Instagram Rollout

|

2018144

|

Could not send Instant Game message to the user at this time, only 5 notifications can be sent to a user within 10 days since they last played.

|

Pause your requests until the number of requests falls below the limit.

|

2018154

|

Messenger Extensions unexpected error

|

|

2018163

|

Begin Share Param Validation Error

|

|

2018166

|

Permission not valid to call the SDK API

|

|

2018171

|

Only available to Primary and Secondary Receivers.

|

|

2018218

|

No profile available for this user.

|

Currently, the User Profile API does not support retrieving profile information for Messenger accounts that were created using a phone number. Please check Source Document: User Profile –– Profile Info (User Profile API)

|

2018234

|

Denying visibility of any secondary receiver to another secondary receiver other than itself.

|

|

2018247

|

Insufficient permission to access user profile.

|

The app calling the User Profile API has not been granted the permissions needed to access one or more of the requested fields. For more information, see Available Profile Fields.

|

2018300

|

Message failed to send because another app is controlling this thread now.

|

|

2018321

|

The chat is currently controlled by Messenger while the user is in an automated question and answer flow. Please wait for the flow to finish before trying again.

|

|

2071010

|

This SDK method is not supported on this Messenger client. Please upgrade

|

|

2071011

|

Messenger Extensions are not enabled – could be “messenger_extensions” was not set on a url, the domain was not added to the allow list or this is an outdated version of Messenger client

|

|

2071014

|

Invalid MessageContent provided to SDK API call

|

|

2071015

|

Invalid title string provided in message content

|

|

2071016

|

Invalid subtitle string provided in message content

|

|

2071017

|

Invalid image URL provided in message content

|

|

2071018

|

Invalid item URL provided in message content

|

|

2071019

|

Invalid button data provided in message content

|

|

2071020

|

URL data is missing in message content. Please provide item_url, button_url or both

|

|

2071021

|

sharingType provided in beginShareFlow call is not valid

|

|

2071022

|

Invalid attachment in begin share flow message content

|

|

2071023

|

Attachment type in message content must be set to template

|

|

2071024

|

Payload is not valid in message content attachment

|

|

2071025

|

Invalid open graph url provided in message content

|

|

9000001

|

This Message has been deleted by the user or the business.

|

OAuthException

|

2018389

Page Not Allowlisted

|

Each Facebook page must be allowlisted by Meta to access the calling alpha

|

Try again later or reduce the frequency or amount of API calls the app is making

|

2018390

Invalid call id

|

The call id provided in the api call is invalid

|

Confirm that the call ID matches the one received in the incoming call webhook

|

2018391

Invalid connection parameter

|

The connection parameter cannot be empty when calling accept call api

|

Make sure the connection parameter matches the api spec and is not null

|

2018392

Invalid SDP parameter

|

The SDP parameter provided in the accept call api is not valid

|

Make sure that the SDP parameter is a valid json dict with keys type and sdp. Confirm that your application is generating SDP correctly.

|

2018393

Invalid call participant page

|

The provided page is not a member of the provided call

|

Ensure that the api call is for the right page for the given call id

|

2018394

Insufficient permissions to join call

|

The page has Insufficient permission to join the provided call

|

Ensure that the page id is correct for the given call id

|

2018395

Cannot join failed call

|

You cannot join a call that has failed

|

Wait for the user to call back

|

2018396

Cannot join ended call

|

You cannot join a call that has ended

|

Wait for the user to call back

|

Error code TBD

Call rate limit exceeded

|

Limit reached for maximum calls that can be initiated by the business

|

Try again later or reduce the frequency or amount of API calls the app is making

## See Also

- Error Handling – Requests made to our APIs can result in several different error responses. There are different recovery tactics. The document provides a list of error values with a map to the most common recovery tactic to use.
- Rate Limits – A rate limit is the number of API calls an app or user can make within a given time period. If this limit is exceeded or if CPU or total time limits are exceeded, the app or user may be throttled. API requests made by a throttled user or app will fail.

Build with Meta

AIMeta Horizon Social technologiesWearables

News

Meta for DevelopersBlogSuccess stories

Support

Developer SupportBug toolPlatform statusDeveloper community forumReport an incident

Terms and policies

Responsible platform initiativesPlatform termsDeveloper policiesPrivacy policyCookies

About us

AboutCareers

Build with Meta

AI

Meta Horizon

Social technologies

Wearables

News

Meta for Developers

Blog

Success stories

Support

Developer Support

Bug tool

Platform status

Developer community forum

Report an incident

About us

About

Careers

Terms and policies

Responsible platform initiatives

Platform terms

Developer policies

Privacy policy

Cookies

Build with Meta

AI

Meta Horizon

Social technologies

Wearables

News

Meta for Developers

Blog

Success stories

Support

Developer Support

Bug tool

Platform status

Developer community forum

Report an incident

About us

About

Careers

Terms and policies

Responsible platform initiatives

Platform terms

Developer policies

Privacy policy

Cookies

Build with Meta

AI

Meta Horizon

Social technologies

Wearables

News

Meta for Developers

Blog

Success stories

Support

Developer Support

Bug tool

Platform status

Developer community forum

Report an incident

About us

About

Careers

Terms and policies

Responsible platform initiatives

Platform terms

Developer policies

Privacy policy

Cookies

English (US)
