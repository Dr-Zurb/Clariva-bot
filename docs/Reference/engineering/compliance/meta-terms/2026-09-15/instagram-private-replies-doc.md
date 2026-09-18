# Instagram Platform: Private Replies developer doc (snapshot)

> Snapshot for compliance reference. Source: https://developers.facebook.com/docs/instagram-platform/private-replies/
> Fetched: 2026-09-15 (IST). Meta's live page is canonical; this copy is for audit evidence.

Build with us

Docs

Blog

Resources

Developer centers

Login

Instagram Platform

Instagram Platform

Instagram Platform

Overview

Webhooks

Webhooks

Instagram Post Shares: New Attachment Type and Transition Period

Examples

Create an App

Instagram API with Instagram Login

Instagram API with Instagram Login

Migration Guide

Business Login for Instagram

Get started

Messaging

Messaging

User Profile API

Quick Replies

Generic Template

Button Template

Sender Actions

Persistent Menu

Ice Breakers

ig.me

Welcome message ads

Conversations API

Mentions

Instagram API with Facebook Login

Instagram API with Facebook Login

Get Started

Facebook Login for Business

Business Discovery

Creator Marketplace API

Copyright Detection

Hashtag Search

Mentions

Product Tagging

Upcoming Events

Collaboration

Publish Content

Publish Content

Resumable Uploads

Audio API

Comment Moderation

Private Replies

Insights

Sharing to Feed

Sharing to Stories

oEmbed

Embed Button

Self Messaging

API Reference

API Reference

Error Codes

Access Token

IG Comment

IG Comment

Replies

IG Container

IG Hashtag Search

IG Hashtag

IG Hashtag

Recent Media

Top Media

IG Media

IG Media

Children

Collaborators

Comments

Insights

Product Tags

IG User

IG User

Available Catalogs

Business Discovery

Catalog Product Search

Connected Threads User

Content Publishing Limit

Insights

Instagram-Backed Threads User

Live Media

Media

Media Publish

Mentions

Mentioned Comment

Mentioned Media

Product Appeal

Recently Searched Hashtags

Stories

Tags

/me

Oauth Authorize

Page

Refresh Access Token

App Review

Support

Changelog

Resources

Changelog

Docs

Overview

Send a Private Reply to a Commenter

# Send a Private Reply to a Commenter

Updated: Jun 30, 2026

Copy for LLM

View as Markdown

This documents shows you how to programmatically send a private reply to a person who commented on your app user’s Instagram professional post, reel, story, Live, or ad post.

## How It Works

Step 1. An Instagram user comments on your app user’s Instagram professional post, reel, story, Live, or ad post.

Step 2. A webhook event is triggered and Meta sends your server a notification with information about the comment including:

- Your app user’s Instagram professional account ID
- The commenter’s Instagram-scoped ID and username
- The comment’s ID
- The media’s ID, if the commenter included media in their comment
- The text of the comment, if applicable

Step 3. Your app uses the comment’s ID to send a private response directly to the Instagram user. This reply appears in the person’s Inbox, if the person follows the Instagram professional account, or to the Request folder, if they do not.

Step 4. Your app can send this private reply within 7 days of the creation time of the comment, excepting Instagram Live, where replies can only be sent during the live broadcast. The private reply message includes a link to the commented post.

## Requirements

This guide assumes you have read the Instagram Platform Overview and implemented the needed components for using this API, such as a Meta login flow and a webhooks server to receive notifications.

You need the following:

| |
Instagram API with Instagram Login
|
Instagram API with Facebook Login

|

Access Tokens

|

- Instagram User access token

|

- Facebook Page access token

|

Host URL

|

graph.instagram.com

|

graph.facebook.com

|

Login Type

|

Business Login for Instagram

|

Facebook Login for Business

|

Permissions

|

- instagram_business_basic
- instagram_business_manage_comments

|

- instagram_basic
- instagram_manage_comments
- pages_read_engagement

If the app user was granted a role on the Page connected to your app user’s Instagram professional account via the Business Manager, your app will also need:

- ads_management
- ads_read

|

Webhooks

|

- comments
- live_comments

|

- comments
- live_comments

### Limitations

- Only one message can be sent to the commenter
- The message must be sent within 7 days of the comment was made on the post or reel
- For Instagram Live, private replies can only be sent during the live broadcast. Once the broadcast ends, private replies cannot be sent
- Follow-up messages can only be sent if the recipient responds, and must be sent within 24 hours of the response

## Send a Private Reply

To send a private reply to a commenter on your app user’s Instagram professional post, reel, or story, send a POST request to the <APP_USERS_IG_ID>/messages endpoint. The recipient parameter should contain the comment’s ID and the message parameter should contain the text you wish to send.

#### Sample request

Formatted for readability.

curl -i -X POST "https://<HOST_URL>/<API_VERSION>/<APP_USERS_IG_ID>/messages"
-H "Content-Type: application/json"
-H "Authorization: Bearer <ACCESS_TOKEN>"
-d '{
"recipient":{
"comment_id": "<COMMENT_ID>"
},
"message": {
"text": "<COMMENT_TEXT>"
}
}'

On success, your app receives a JSON response with the recipient’s Instagram-scoped ID and the ID for the message.

{
"recipient_id": "526...", // The Instagram-scoped ID
"message_id": "aWdfZ..." // The ID for the private reply message
}

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
