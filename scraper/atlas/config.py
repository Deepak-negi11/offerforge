"""Static configuration: companies, canonical rounds/categories/topics, and paths."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RAW = DATA / "raw"  # curated + extracted company files (source of truth)
EXTRACTED = RAW / "extracted"  # output of `atlas extract`, merged by `atlas build`
CACHE = DATA / "cache"
PAGES = CACHE / "pages"  # fetched page markdown, keyed by URL hash
DISCOVERED = CACHE / "discovered"  # candidate URLs per company (jsonl)
OUT = ROOT / "web" / "public" / "data" / "atlas.json"

# logo = Simple Icons slug when one exists (https://simpleicons.org), else None -> monogram.
COMPANIES: dict[str, dict] = {
    "amazon": {"name": "Amazon", "group": "Big Tech", "logo": None, "domain": "amazon.jobs"},
    "google": {"name": "Google", "group": "Big Tech", "logo": "google", "domain": "careers.google.com"},
    "microsoft": {"name": "Microsoft", "group": "Big Tech", "logo": None, "domain": "careers.microsoft.com"},
    "meta": {"name": "Meta", "group": "Big Tech", "logo": "meta", "domain": "metacareers.com"},
    "apple": {"name": "Apple", "group": "Big Tech", "logo": "apple", "domain": "jobs.apple.com"},
    "netflix": {"name": "Netflix", "group": "Big Tech", "logo": "netflix", "domain": "jobs.netflix.com"},
    "nvidia": {"name": "Nvidia", "group": "Big Tech", "logo": "nvidia", "domain": "nvidia.com"},
    "uber": {"name": "Uber", "group": "Product", "logo": None, "domain": "uber.com/careers"},
    "adobe": {"name": "Adobe", "group": "Product", "logo": None, "domain": "adobe.com/careers"},
    "salesforce": {"name": "Salesforce", "group": "Product", "logo": None, "domain": "salesforce.com/careers"},
    "oracle": {"name": "Oracle", "group": "Product", "logo": None, "domain": "oracle.com/careers"},
    "atlassian": {"name": "Atlassian", "group": "Product", "logo": "atlassian", "domain": "atlassian.com/company/careers"},
    "intuit": {"name": "Intuit", "group": "Product", "logo": None, "domain": "intuit.com/careers"},
    "cisco": {"name": "Cisco", "group": "Product", "logo": None, "domain": "jobs.cisco.com"},
    "qualcomm": {"name": "Qualcomm", "group": "Product", "logo": None, "domain": "qualcomm.com/careers"},
    "walmart-global-tech": {"name": "Walmart Global Tech", "group": "Product", "logo": None, "domain": "careers.walmart.com"},
    "goldman-sachs": {"name": "Goldman Sachs", "group": "Finance", "logo": None, "domain": "goldmansachs.com/careers"},
    "jpmorgan-chase": {"name": "JPMorgan Chase", "group": "Finance", "logo": None, "domain": "careers.jpmorgan.com"},
    "morgan-stanley": {"name": "Morgan Stanley", "group": "Finance", "logo": None, "domain": "morganstanley.com/careers"},
    "flipkart": {"name": "Flipkart", "group": "Indian Product", "logo": None, "domain": "flipkartcareers.com"},
    "zomato": {"name": "Zomato", "group": "Indian Product", "logo": None, "domain": "zomato.com/careers"},
    "swiggy": {"name": "Swiggy", "group": "Indian Product", "logo": "swiggy", "domain": "careers.swiggy.com"},
    "phonepe": {"name": "PhonePe", "group": "Indian Product", "logo": "phonepe", "domain": "phonepe.com/careers"},
    "razorpay": {"name": "Razorpay", "group": "Indian Product", "logo": "razorpay", "domain": "razorpay.com/jobs"},
    "tcs": {"name": "TCS", "group": "Services & Consulting", "logo": None, "domain": "tcs.com/careers"},
    "infosys": {"name": "Infosys", "group": "Services & Consulting", "logo": None, "domain": "infosys.com/careers"},
    "accenture": {"name": "Accenture", "group": "Services & Consulting", "logo": "accenture", "domain": "accenture.com/careers"},
    "deloitte": {"name": "Deloitte", "group": "Services & Consulting", "logo": None, "domain": "deloitte.com/careers"},
    "linkedin": {"name": "LinkedIn", "group": "Big Tech", "logo": None, "domain": "careers.linkedin.com"},
    "airbnb": {"name": "Airbnb", "group": "Product", "logo": "airbnb", "domain": "careers.airbnb.com"},
    "stripe": {"name": "Stripe", "group": "Product", "logo": None, "domain": "stripe.com/jobs"},
    "bloomberg": {"name": "Bloomberg", "group": "Finance", "logo": None, "domain": "bloomberg.com/company/careers"},
    "databricks": {"name": "Databricks", "group": "Product", "logo": "databricks", "domain": "databricks.com/company/careers"},
    "servicenow": {"name": "ServiceNow", "group": "Product", "logo": None, "domain": "careers.servicenow.com"},
    "snowflake": {"name": "Snowflake", "group": "Product", "logo": "snowflake", "domain": "careers.snowflake.com"},
    "paypal": {"name": "PayPal", "group": "Product", "logo": "paypal", "domain": "careers.pypl.com"},
    "visa": {"name": "Visa", "group": "Finance", "logo": None, "domain": "corporate.visa.com/en/jobs"},
    "nutanix": {"name": "Nutanix", "group": "Product", "logo": None, "domain": "nutanix.com/company/careers"},
    "intel": {"name": "Intel", "group": "Hardware", "logo": None, "domain": "intel.com/jobs"},
    "samsung": {"name": "Samsung", "group": "Hardware", "logo": None, "domain": "research.samsung.com/careers"},
    "texas-instruments": {"name": "Texas Instruments", "group": "Hardware", "logo": None, "domain": "careers.ti.com"},
    "amd": {"name": "AMD", "group": "Hardware", "logo": None, "domain": "careers.amd.com"},
    "ibm": {"name": "IBM", "group": "Hardware", "logo": None, "domain": "ibm.com/careers"},
    "de-shaw": {"name": "D. E. Shaw", "group": "Finance", "logo": None, "domain": "deshawindia.com/careers"},
    "tower-research": {"name": "Tower Research Capital", "group": "Finance", "logo": None, "domain": "tower-research.com/open-positions"},
    "arcesium": {"name": "Arcesium", "group": "Finance", "logo": None, "domain": "arcesium.com/careers"},
    "american-express": {"name": "American Express", "group": "Finance", "logo": "americanexpress", "domain": "aexp.eightfold.ai/careers"},
    "mastercard": {"name": "Mastercard", "group": "Finance", "logo": "mastercard", "domain": "careers.mastercard.com"},
    "paytm": {"name": "Paytm", "group": "Indian Product", "logo": None, "domain": "paytm.com/careers"},
    "meesho": {"name": "Meesho", "group": "Indian Product", "logo": None, "domain": "meesho.io/jobs"},
    "cred": {"name": "CRED", "group": "Indian Product", "logo": None, "domain": "careers.cred.club"},
    "myntra": {"name": "Myntra", "group": "Indian Product", "logo": None, "domain": "careers.myntra.com"},
    "makemytrip": {"name": "MakeMyTrip", "group": "Indian Product", "logo": None, "domain": "careers.makemytrip.com"},
    "zoho": {"name": "Zoho", "group": "Indian Product", "logo": None, "domain": "zoho.com/careers"},
    "juspay": {"name": "Juspay", "group": "Indian Product", "logo": None, "domain": "juspay.io/careers"},
    "browserstack": {"name": "BrowserStack", "group": "Indian Product", "logo": None, "domain": "browserstack.com/careers"},
    "sprinklr": {"name": "Sprinklr", "group": "Indian Product", "logo": None, "domain": "sprinklr.com/careers"},
    "media-net": {"name": "Media.net", "group": "Indian Product", "logo": None, "domain": "careers.media.net"},
    "groww": {"name": "Groww", "group": "Indian Product", "logo": None, "domain": "groww.in/careers"},
    "dream11": {"name": "Dream11", "group": "Indian Product", "logo": None, "domain": "dreamsports.group/careers"},
    "ola": {"name": "Ola", "group": "Indian Product", "logo": None, "domain": "olacabs.com/careers"},
    "rubrik": {"name": "Rubrik", "group": "Product", "logo": None, "domain": "rubrik.com/company/careers"},
    "sap-labs": {"name": "SAP Labs", "group": "Product", "logo": None, "domain": "jobs.sap.com"},
    "wipro": {"name": "Wipro", "group": "Services & Consulting", "logo": None, "domain": "careers.wipro.com"},
    "cognizant": {"name": "Cognizant", "group": "Services & Consulting", "logo": None, "domain": "careers.cognizant.com"},
    "capgemini": {"name": "Capgemini", "group": "Services & Consulting", "logo": None, "domain": "capgemini.com/careers"},
    "hcltech": {"name": "HCLTech", "group": "Services & Consulting", "logo": None, "domain": "hcltech.com/careers"},
    "tech-mahindra": {"name": "Tech Mahindra", "group": "Services & Consulting", "logo": None, "domain": "careers.techmahindra.com"},
}

GROUP_ORDER = ["Big Tech", "Product", "Finance", "Hardware", "Indian Product", "Services & Consulting"]

# Canonical round -> sort order. Anything unknown collapses to "Technical Interview".
ROUND_ORDER: dict[str, int] = {
    "Online Assessment": 10,
    "Communication Assessment": 12,
    "Group Discussion": 14,
    "Phone Screen": 20,
    "Technical Interview 1": 31,
    "Technical Interview 2": 32,
    "Technical Interview 3": 33,
    "Technical Interview": 35,
    "Machine Coding": 40,
    "Low Level Design": 45,
    "System Design": 50,
    "Superday": 55,
    "Hiring Manager": 60,
    "Bar Raiser": 65,
    "Behavioral": 70,
    "HR": 80,
}

CATEGORIES = [
    "DSA",
    "Backend",
    "System Design",
    "LLD",
    "CS Fundamentals",
    "SQL",
    "Aptitude",
    "Puzzles",
    "Project",
    "Behavioral",
]

CATEGORY_ALIASES = {
    "dsa": "DSA", "coding": "DSA", "algorithms": "DSA", "data structures": "DSA",
    "backend": "Backend", "back-end": "Backend", "backend fundamentals": "Backend",
    "system design": "System Design", "hld": "System Design", "high level design": "System Design",
    "lld": "LLD", "low level design": "LLD", "machine coding": "LLD", "ood": "LLD", "object oriented design": "LLD",
    "cs fundamentals": "CS Fundamentals", "core cs": "CS Fundamentals", "cs": "CS Fundamentals", "theory": "CS Fundamentals",
    "sql": "SQL", "database": "SQL",
    "aptitude": "Aptitude", "quant": "Aptitude", "reasoning": "Aptitude",
    "puzzle": "Puzzles", "puzzles": "Puzzles", "probability": "Puzzles", "brain teaser": "Puzzles",
    "project": "Project", "projects": "Project", "resume": "Project",
    "behavioral": "Behavioral", "behavioural": "Behavioral", "hr": "Behavioral", "leadership principles": "Behavioral",
}

TOPIC_ALIASES = {
    "array": "Arrays", "arrays": "Arrays", "string": "Strings", "strings": "Strings",
    "hashmap": "Hashing", "hash map": "Hashing", "hash table": "Hashing", "hashing": "Hashing", "hash": "Hashing",
    "two pointer": "Two Pointers", "two pointers": "Two Pointers",
    "sliding window": "Sliding Window", "binary search": "Binary Search",
    "stack": "Stack", "monotonic stack": "Stack", "queue": "Queue", "deque": "Queue",
    "linked list": "Linked List", "linkedlist": "Linked List", "linked lists": "Linked List",
    "tree": "Trees", "trees": "Trees", "binary tree": "Trees", "binary trees": "Trees",
    "bst": "BST", "binary search tree": "BST",
    "heap": "Heap", "heaps": "Heap", "priority queue": "Heap", "heap / priority queue": "Heap",
    "graph": "Graphs", "graphs": "Graphs", "bfs": "BFS", "dfs": "DFS",
    "union find": "Union Find", "dsu": "Union Find", "disjoint set": "Union Find",
    "topological sort": "Topological Sort", "toposort": "Topological Sort",
    "dp": "Dynamic Programming", "dynamic programming": "Dynamic Programming",
    "greedy": "Greedy", "backtracking": "Backtracking", "recursion": "Recursion",
    "trie": "Trie", "tries": "Trie", "interval": "Intervals", "intervals": "Intervals",
    "bit manipulation": "Bit Manipulation", "bits": "Bit Manipulation",
    "math": "Math", "maths": "Math", "number theory": "Math", "matrix": "Matrix", "sorting": "Sorting",
    "prefix sum": "Prefix Sum", "segment tree": "Segment Tree", "shortest path": "Shortest Path", "dijkstra": "Shortest Path",
    "os": "Operating Systems", "operating system": "Operating Systems", "operating systems": "Operating Systems",
    "dbms": "DBMS", "databases": "Databases", "database": "Databases",
    "cn": "Computer Networks", "networking": "Computer Networks", "computer networks": "Computer Networks", "networks": "Computer Networks",
    "oop": "OOP", "oops": "OOP", "object oriented programming": "OOP",
    "caching": "Caching", "cache": "Caching", "api": "APIs", "apis": "APIs", "rest": "APIs", "rest apis": "APIs",
    "concurrency": "Concurrency", "multithreading": "Concurrency", "threads": "Concurrency",
    "distributed systems": "Distributed Systems", "message queues": "Message Queues", "kafka": "Message Queues",
    "c/c++": "C/C++", "c++": "C/C++", "c": "C/C++", "java": "Java", "python": "Python", "javascript": "JavaScript",
    "computer architecture": "Computer Architecture", "embedded": "Embedded",
    "leadership principles": "Leadership Principles", "behavioral": "Behavioral", "behavioural": "Behavioral",
    "quantitative aptitude": "Quantitative Aptitude", "logical reasoning": "Logical Reasoning", "verbal ability": "Verbal Ability",
    "pseudo code": "Pseudo Code", "pseudocode": "Pseudo Code", "probability": "Probability",
    "design": "Design", "system design": "System Design", "lld": "Low Level Design", "low level design": "Low Level Design",
}

# Prep sites that compile questions rather than publish first-hand reports.
AGGREGATOR_HOSTS = [
    "igotanoffer", "tryexponent", "interviewquery", "prachub", "codingkaro", "aced.", "finalroundai",
    "prepinsta", "faceprep", "indiabix", "interviewbit", "javatpoint", "simplilearn", "naukri.com/code360",
    "lockedinai", "linkjob.ai", "interviewing.io/guides", "designgurus", "hellointerview",
]

PLATFORMS = {"aggregator", "gfg", "leetcode", "reddit", "linkedin", "x", "glassdoor", "medium", "blog", "youtube", "hn", "other"}

# Search queries used by `atlas discover`. {company} and {role} are substituted.
DISCOVERY_QUERIES = [
    "{company} {role} online assessment questions {year}",
    "{company} {role} interview experience {year}",
    "{company} {role} interview questions rounds",
    "site:geeksforgeeks.org {company} interview experience {role}",
    "site:leetcode.com/discuss {company} {role} interview",
    "site:reddit.com {company} {role} OA questions",
    "site:linkedin.com/posts {company} {role} interview experience",
    "site:x.com {company} {role} interview questions",
]
ROLES = {"intern": "SDE intern", "fulltime": "SDE new grad"}
