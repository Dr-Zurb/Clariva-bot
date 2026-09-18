# Meta Developer Policies (snapshot)

> Snapshot for compliance reference. Source: https://developers.facebook.com/devpolicy/
> Fetched: 2026-09-15 (IST). Meta's live page is canonical; this copy is for audit evidence.

## Developer Policies

1. Build a trustworthy product

2. Encourage proper use

3. Things you should know

If you use these features, follow these additional policies:

4. Games

5. Messenger Platform, Instagram Messaging APIs and Messaging Plugins

6. Instagram Platform

7. Marketplace Platform

8. Commerce Platform

9. Live API

10. Ads

11. Pages API

12. Social Plugins

13. Payments

Last updated February 3, 2026.

# Developer Policies

The Meta for Developers Platform (“Platform”) is the set of APIs, SDKs, tools, plugins, code, technology, content and services that enables others, including App developers and website operators, to develop functionality, retrieve data from Meta and any other Meta Products, or provide data to Meta.

To use Platform, you agree to and must comply with these Developer Policies and all other Developer Docs, which are all a part of and are hereby incorporated by reference into the Platform Terms. Capitalized terms not otherwise defined herein have the meaning given in the Platform Terms. For clarity, you agree that your access to and use of Platform is subject to the Platform Terms and all other applicable terms and policies.

## 1. Build a trustworthy product

The following policies apply to all use of Platform:

-
Develop and manage your App with an authentic account.

-
Ensure that your App’s content including ads and user-generated content meets our Community Standards.

-
Follow our Meta Advertising Standards for your App name, icons, and description.

-
Don’t confuse, deceive, defraud, mislead, spam or surprise anyone.

-
Don’t use your App to host, promote or facilitate the distribution of malware, spyware, adware or any other malicious programs or code.

-
Follow any instructions we include in our Developer Docs, including our allowed usage for Platform.

-
Obtain consent from people before publishing content or taking any other action on their behalf.

-
Provide an easily accessible way for people to request support or report issues to you.

-
If you administer a promotion on Meta Products, comply with the relevant Promotion guidelines, such as Pages Promotions Policies and Instagram Promotion Guidelines.

-
Apps with minimal utility that provide predictions, assessments, or similar outputs to the user, may not be allowed on Platform. For example, Apps that provide (or claim to provide) users with assessments of personality, personal attributes, character traits, behavioral tendencies, or whose core functionality otherwise involves making predictions about who the user is, may not be allowed.

## 2. Encourage proper use

The following policies apply to all use of Platform:

-
You are responsible for restricting access to your content in accordance with all applicable laws and regulations, including geo-filtering or age-gating access where required, or when the content is unsuitable for Meta’s general user base.

-
Respect the way Meta Products look and function, and the limits we've placed on product functionality.

-
Verify that you have integrated Login correctly. Your App shouldn't crash or freeze during the testing process.

-
If you want to use our logos or brand, follow the guidelines in the Meta Brand Resource and Permissions Center and the Logos and Trademarks requirements.

-
Be honest about your relationship with Meta when talking to the press or users.

-
Sharing to Stories on Facebook and Instagram:

a. Stories must not include any logos, watermarks, calls-to-action, or other promotional content.

b. Additional policies for Stories with Attribution: (1) Stories must not be generic (i.e., only enable people to share unique and personal content). (2) If a person clicks on your Story, ensure you direct them to an experience that enhances the Story and/or enables them to create their own Story.

-
Don't participate in any program that promotes or facilitates the purchase, sale, or exchange of “Likes”, “Shares”, “Followers”, “Comments”, “Accounts”, “Pages”, “Profiles”, “Groups”, or any of our products, features, or functionalities.

-
If you want to facilitate or promote online gambling, online real money games of skill, or online lotteries, get our written permission before using any of our Meta Products.

## 3. Things you should know

-
We may share your contact info with people who want to contact you.

-
We communicate with developers through Developer Alerts and email from the meta.com, fb.com or facebookmail.com domains. Ensure that the email address associated with your Facebook account and the email address registered to the App are current and that you don’t filter out these messages.

-
iOS and Android apps must be published on a supported app store.

-
If applicable, ensure that your Business Manager account is up to date and accurate.

-
If we determine that your App is creating a negative experience, we may require you to comply with one or more App Development Guidelines, and we may take enforcement action against you or your App(s) for failing to do so.

-
We may take enforcement action on Apps that adversely affect the stability of Meta’s servers or other Apps on Platform.

## 4. Games

-
Facebook Gaming Policies:

The following Facebook Gaming Policies apply to all Facebook Gaming Products and Unconnected Games

a. Use only Meta-owned APIs as described in our Developer Docs to process all in-game purchases regardless of which end payment solution is used.

b. You may only charge for items in your game subject to the In-Game Payments Terms.

c. If your game includes mandatory or optional in-app charges, explain this in your App’s description.

d. Don't create and submit the same game more than once. Update your existing game.

e. Keep your Game’s description and categorization up to date.

f. Don't include promotional content in your Game’s icon (e.g. don't overlay your icon image with "new", "sale", "update" or any type of notification jewel).

-
Instant Games

In addition to the Facebook Gaming Policies, the following policies apply to Instant Games:

a. Don’t request or collect personal or other sensitive data from users in your Instant Game. For example, don’t request or collect email, phone number, physical address, gender, birth date, sexual orientation, ethnicity, family or other demographic information.

b. Don't build, append to, edit, influence, or augment user profiles, including profiles associated with any mobile device identifier or other unique identifier that identifies any particular user, browser, computer or device.

c. Ensure your games adhere to our Games Quality Guidelines.

d. If you want to include ads within your game, only use the Games Ads API. Don’t use a third party ad provider or include any other links to content off your game.

e. Only show context dialogs after a user takes a relevant action within your game. For example, you can show a context.chooseAsync dialog after a user clicks on a 'play with friends' button.

f. Games Updates via Messenger may not be used to advertise, market, promote, or upsell any product or service, including but not limited to in-app purchases or other games on or off of Facebook.

g. We may require you to load your Game in a network-restricted environment that will limit the Game’s access to specific APIs and block in-game features that require callbacks to your servers.

-
Web Games on Facebook.com

In addition to the Facebook Gaming Policies, the following policies apply to Web Games on Facebook.com:

a. Don’t share the same App ID with a desktop web game off of Facebook.com.

b. Don’t use your Facebook.com game to promote or link to a desktop web game off Facebook.

## 5. Messenger Platform and Instagram Messaging APIs

The following policies apply to messaging and calling APIs available on Facebook and Instagram, including Messenger Platform and Instagram Messaging APIs.

-
Ensure your App's integration with Messenger and/or Instagram is stable and functions properly. Don't return confusing or nonsensical messages to users or send generic error messages.

-
User opt in, authentication, and opt-out:

a. Opt-in: Don't contact people in Messenger or Instagram Messaging unless you, or the party to whom you are operating as a Service Provider, have obtained legally sufficient consent, permission, and/or opt-in (collectively, “opt-in”) to do so under all applicable laws of any applicable jurisdiction. You are solely responsible for determining the method of opt-in and you agree to obtain opt-in in a manner that complies with laws applicable to your communications and to provide notices and obtain permissions that are required under applicable law. To the extent that you rely on user authentication to obtain consent to initiate message threads, place any user authentication methods in a clear and conspicuous location, with an easy-to-understand label or textual description which accurately and unambiguously describes the nature of and result of using such authentication.

b. Opt-out: Provide an appropriate legally sufficient means for people to request an opt-out of this messaging functionality, on an ongoing basis. Immediately respect all requests (on or off Messenger and Instagram Messaging) by people to block, discontinue, or otherwise opt out of the messaging functionality.

-
Tech Providers:

a. Ensure your agreements with entities do not conflict with, and that entities agree to, all applicable Meta terms and policies, including Meta's Terms of Service, these Developer Policies, Instagram Terms of Use, and the Community Standards.

b. Ensure you have the authority to act as an agent for the entity to which you're providing a service, and that your use of our Platform is strictly for the benefit of that entity.

c. Don't facilitate or encourage any violations of our policies. For example, if you have received prior permission from us to provide a feature only to certain entities that have been approved to use a feature, ensure you don't provide that feature to other entities that have not been approved for that feature and do not attempt to provide similar functionality to entities that haven't been approved for that feature.

-
Your messaging or calling experience should not receive excessive negative feedback. Messaging or calling experiences that receive excessive negative feedback, may be feature limited, paused, rate-limited or removed from Platform.

-
Maintain a Facebook Page that provides accurate customer support contact information, including your mailing address and one or more of the following: email address, web address, or telephone number.

-
Messages, Calls and Data:

-
Acceptable message types:

a. After people interact with your App: The service we provide allows you to message people within 24 hours of a person's interaction with your Facebook Page, Instagram account or messaging App (ex: messaging your App or interacting with a Messenger plugin on your website) or to send Marketing Messages in accordance with our Developer Docs.

b. Message Tags and other features: You may send select Message Tags outside the 24 hour period as described within our Developer Docs. Monitor your block rate, to understand how people are responding to your messages. You may only use a Message Tag, template, utility message, quick reply or other structured message or feature for its intended purpose as described within our Developer Docs.

-
Unacceptable message or call types:

a. Pages or Apps may not facilitate person-to-person messaging, calling, relays, or interactions that mask user identities from each other without giving individual users the ability to block other users within the messaging or calling experience.

b. Sending spam as defined in the Community Standards is not allowed. This includes behavior creating bots either manually or automatically, at very high frequencies; buying or selling feature privileges; facilitating or encouraging inauthentic behavior; failing to deliver promised experiences; directing users off Facebook or Instagram via deceptive or malicious URLs; and other substantially similar behavior designed to deceive or mislead users.

c. Do not use Message Tags or utility messages to send promotional content or other advertising, marketing, or solicitations including but not limited to the promotion of goods or services; to upsell; communicate new product announcements; request donations; send daily deals, coupons, discounts or sale announcements; to send polls or user questionnaires. Use the Marketing Messages API, if you want to send marketing or promotional content.

d. Don't prefill any content in messages unless (a) it was created by the person using your App or (b) it was created by a business whose employees use your App to administer the business's presence on Meta Products.

-
News Messaging (unavailable on Instagram):

a. Only Pages that are registered and approved as News Publishers via the News Publisher Registration Process are eligible to use News Messaging (previously described as subscription-based messaging.) Other Pages including those that provide general updates from businesses, groups, interests, politicians or other entities with commercial, promotional, or political purposes are not eligible for News Messaging.

b. News Messaging from approved News Publishers should be used to deliver timely newsworthy updates to users. News Messaging may not include promotional content or other advertising, marketing, or solicitations including but not limited to the promotion of goods or services including news subscriptions; to upsell; communicate new product announcements; request donations; send daily deals, coupons, discounts or sale announcements; to send polls or user questionnaires.

-
Data: Don't use any data obtained from us about the people you reach in Messenger and/or Instagram Messaging, other than the content of message threads or calls, for any purpose other than as reasonably necessary to support the message or calling types you elect to use.

-
Healthcare: Don't use Messenger and/or Instagram Messaging features, including messaging and calling, to facilitate direct conversations between people and healthcare providers or to send or collect any patient data obtained from healthcare providers.

-
Offers and Payments:

a. Don't share or ask people to share individual payment card, financial account numbers or other cardholder data within messages or calls.

b. If you have permission to offer or complete sales of goods or services within Messenger, adhere to the Seller Agreement.

c. Don't use Messenger and/or Instagram Messaging features, including messaging and calling, to sell digital goods.

-
Calling

VoIP-VoIP Calling Only: You will not use public switched telephone networks (“PSTN”) on any leg of a call between you (or your clients) and a user. Only VoIP-VoIP calling is permitted. You acknowledge and understand that any use of PSTN by you on any leg of a call between you (or your clients) and a user could result in regulatory inquiry, enforcement actions, fines and/or other penalties.

-
Additional policies on Instagram Messaging:

a. Prior to linking an Instagram account to a Facebook Page, you will ensure the owner of such Instagram account acknowledges and agrees that all users with a Page role of moderator or higher will have the ability to view and respond to messages sent via Instagram Messaging.

## 6. Instagram Platform

-
Comply with any requirements or restrictions imposed on usage of Instagram user photos and videos ("User Content") by their respective owners. You are solely responsible for making use of User Content in compliance with owners' requirements or restrictions.

-
Don't use the Instagram Platform to simply display User Content, import or backup content, or manage Instagram relationships, without our prior permission.

## 7. Marketplace Platform

-
If you are a Tech Provider using the Marketplace Platform to enable your customers to access and use Marketplace Platform you must ensure that your customers agree to and comply with our Seller Agreement. For any use of the Marketplace Platform other than as a Tech Provider, you must also agree to our Seller Agreement.

-
You must comply with all applicable laws and regulations, and you acknowledge and agree that Meta is not responsible for your obligations under such regulations.

-
You will use commercially reasonable efforts to obtain conversion data requested by us for leads driven from your use of Marketplace Platform (Ex: Whether such leads result in a scheduled appointment or sale, lease or rental), and will provide any such data that you obtain to us on a daily basis. You hereby grant, and agree you have the right to grant, us and our affiliates a perpetual non-exclusive right to use and exploit such data for any purpose, without any right to compensation from us.

-
Marketplace Lead Data: Don't use or transfer to a third party (except to your merchant providing the listing) any data you access via the Marketplace Platform lead form features or Lead Generation API or Business Manager (or any successor APIs or technology) except to contact the applicable user about the specific listing for which the data was provided. If you transfer the data to your merchant customer for the purpose above, you do so solely at your own risk and must ensure that such merchant complies with these terms and all applicable laws and regulations.

## 8. Commerce Platform

-
If you are a Tech Provider using the Commerce Platform to enable your customers to access and use Commerce Platform, you must ensure that your customers agree to and comply with our Seller Agreement. For any use of the Commerce Platform other than as a Tech Provider, you must also agree to our Seller Agreement.

-
As we continue to make Commerce Platform versions and features available to you, you will make reasonable efforts to implement such versions and features in your App and comply with applicable provisions of our terms, including the Seller Agreement. If we direct you to implement any such Commerce Platform features or versions, you will do so as reasonably practicable.

## 9. Live API

-
Ensure any pre-recorded content is clearly distinguishable from live content, and includes appropriate disclosures about being pre-recorded in the description or through graphics. Also ensure you comply with the additional requirements we include for Facebook Live here.

-
Don't use the API to publish looping videos; static, animated, or looping images; or to live-stream polls associated with unmoving or ambient broadcasts. Also ensure you comply with the additional requirements we include for Facebook Live here.

-
If you enable people to publish Live Video to Facebook, remind them of their obligation to not include third party ads in their video content and to comply with these policies and all other applicable terms and policies.

## 10. Ads

-
If you have ads in your app on Facebook or if you run ads through Audience Network, comply with our Meta Advertising Standards.

-
Don’t include third-party ads (including for other Apps) in posts, comments, notifications, requests, invites or messages.

-
Don’t include or pair Social Plugins or Login with non-Meta ads.

The following policies apply to all ad buying solutions:

-
Standard and Advanced Ads API access may be downgraded to Development access after 30 days of non-use.

-
Don't combine multiple end advertisers or their Meta business assets in the same ad account, unless you meet the requirements described here or as otherwise approved by Meta in writing.

-

#### Transparency (Effective February 3, 2027)

a. If requested by an end advertiser, you must disclose to such end advertiser (i) the amount that you spent on Meta advertising on behalf of such end advertiser, separate from your fees, and the associated fee structure you charge, and (ii) the campaign configuration, campaign settings, and/or post-campaign reporting for the end advertiser’s Meta ad campaign, using Meta terminology. Unless required by law, we do not disclose this information proactively; however, if we identify or suspect a violation of this policy, we may, upon the end-advertiser's request, provide the disclosures in (i)–(ii). We may, but are not obligated to, notify you if such a disclosure occurs.

b. Display Meta ad campaign reporting separately from other publishers.

c. We may require documentation from you to ensure your compliance with these terms and we may require you to disclose who your end advertisers are.

-
Data Collection and Use:

a. Don’t use Meta advertising data for any purpose, except on an aggregate and anonymous basis (unless the terms for that product allow it explicitly) and only to assess the performance and effectiveness of the end advertiser’s campaigns.

b. Only use data from an end-advertiser’s campaign to optimize or measure the performance of that end-advertiser’s Meta campaign.

c. Don’t use data to retarget on or off of Meta.

d. Don’t mix data obtained from us with advertising campaigns on different platforms (unless the terms for that product allow it explicitly).

e. Don’t use Meta’s data to build or augment any user profiles.

f. Only allow the end advertiser or people acting on their behalf to access Meta’s Platform data.

g. Keep Meta’s data that you maintain on behalf of one advertiser separately from that of other advertisers.

-
Ensure that your clients agree to Meta’s Terms of Service, including the Meta Advertising Standards Policies, the Commercial Terms of Service and the Self-Serve Ads Terms. If you are using a Meta Product in relation to your ad-buying solution that has supplemental terms (such as, without limitation, the Customer List Custom Audiences Terms or the Business Tools Terms), then you must ensure that your client agrees to those supplemental terms.

## 11. Pages API

-
Ensure you comply with our Pages, Groups and Events Policies.

-
Don't charge a fee for creating or claiming a Page.

-
Before enabling people to create a Page, first provide a means for them to claim an existing Place to prevent Page duplication.

-
Ensure that your clients agree to Meta’s Terms of Service, including the Meta Advertising Standards .

-
Don't create or claim a Page on behalf of people without their consent.

-
Don't prevent people from gaining access to any Page you create or manage on their behalf.

-
Don't disclose administrators of a Page to third parties without the administrator's consent.

## 12. Social Plugins

-
Don’t include or pair Social Plugins or Login with non-Meta ads.

-
Don’t sell or purchase placement of social plugins or sharer.php.

-
Don’t obscure or cover elements of social plugins.

## 13. Payments

-
If you use Meta Payments, comply with the Facebook Developer Payments Terms.

-
Don’t use Meta Payments to solicit, collect or transfer funds for charitable causes without our prior permission.

-
If you’re using iOS to run your App, use an iOS approved payment method.

-
If you accept payments on Meta, only do so in your app.

## 14. Instant Experiences

-
If you are offering or completing sales of goods or services with an Instant Experience, comply with the Seller Agreement. If you are enabling another entity to offer or complete sales of goods or services with an Instant Experience, you must ensure that the entity agrees to the Seller Agreement; and Facebook’s Terms of Service; and if applicable the Instagram Terms of Use.

-
If you are using Instant Experience payment features (ex: PaymentRequest API): (a) ensure that the payment amount requested accurately reflects the total price presented to the customer for the goods or services requested by the customer, (b) you must comply with the payments section of the Seller Agreement; and (c) you may only use payment features in countries outside of the United States with our approval.
