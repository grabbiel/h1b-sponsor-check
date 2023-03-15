# H1b Sponsor Checker (H1B Wizard)

An easy plugin for international students job hunting in the USA: see which openings sponsor you, and which companies are likely to do so. All while browsing your favorite job board sites (e.g., LinkedIn, Indeed, etc.)

![Promotional Banner](https://raw.githubusercontent.com/pakitow/pakitow/main/images-repository/promo-tile-original.png "Banner")

An official product in both the **Addons Firefox marketplace** and the **Chrome Webstore**, this browser extension is open-source and accepting pull requests.

![Main Overview] (https://raw.githubusercontent.com/pakitow/pakitow/main/images-repository/overview.png "Overview")

#### Strict Manifest Permissions and Versioning Requirements Are In Place:
1. We cannot request "tabs" permissions, as it acts as an overreach in terms of user data management. "ActiveTab" permissions is preferred.
2. When specifying "host_permissions", the URL should be path exhaustive, i.e., write "www.linkedin.com/jobs/search/*" instead of "www.linkedin.com/*".
3. This extension does not support manifest V2 or earlier.
4. Injecting content scripts programmatically is limited to sites with non-static loading, such as LinkedIn, where waiting for injection by Chrome API takes several reloadings of the same page. Otherwise, avoid scripting injection.

#### Upcoming Features (Dependent on Developers' Resources)
1. Hosting of Spring Boot API processing queries and supporting Redis caching.
2. Hosting of Kafka Topic Producer processing job descriptions retrieved by client (background service worker) and publishing to Kafka consumer.
3. Hosting of Kafka Topic Producer processing prelimary company name matches between website version and USCIS version and publishing to Kafka consumer.
4. Hosting of Kafka consumer in charge of both:
  1. Creating new JSON records in a DynamoDB instance, which stores job description, preliminary sponsor classification, and company name.
  2. Inserting new records to a table storing matches between site-specifc company names and USCIS company names.

#### New Features Being Developed
1. ETL pipeline annually updating **h1b_records** table.
2. ML model trained to verify if any given job posting will sponsor an international applicant, based on the DynamoDB JSON repository.
3. Extended browser compatibility with Safari app and web.
4. Extended website compatibility with Glassdoor and Handshake.
5. Inclusion of UK, Canadian and Australian employers' sponsoring history to account for more users living outside the USA.

#### Current Fixes
1. Transpiling current code base to TSX.
2. Replacing HTML injection by React client-side rendering.
