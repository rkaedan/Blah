import { serve } from "std/http/server.ts";
import { getCookies, setCookie } from "std/http/cookie.ts";
import { join } from "std/path/mod.ts";

const PORT = 8000;

// --- Firebase & Configuration Setup ---
// MANDATORY: These global variables are provided by the hosting environment
// We get the app ID from the environment or use a default
const __app_id = Deno.env.get('__app_id') ?? 'default-kvs-app';

// Database Path Structure (as required for Canvas/Firestore):
const KVS_CONTENT_COLLECTION = `/artifacts/${__app_id}/public/data/kvs_content`;

// We use a map to simulate a secure, in-memory session store (role: 'admin' or 'school')
// Key: Session ID (UUID), Value: { userRole: 'admin' | 'school' }
const SESSION_STORE = new Map<string, { userRole: 'admin' | 'school' }>();

// Mock Database Content
const MOCK_DATABASE = {
    "math10_ch1": {
        "class": 10, 
        "subject": "Mathematics", 
        "chapter": "Chapter 1: Real Numbers", 
        "type": "Textbook", 
        "file_url": "https://mocklink.com/math10_ch1_book.pdf"
    },
    "hist11_notes": {
        "class": 11, 
        "subject": "History", 
        "chapter": "Notes - Mughal Empire", 
        "type": "Notes", 
        "file_url": "https://mocklink.com/hist11_notes_mughal.pdf"
    }
};


// --- Utility Functions ---

/** Generates a unique session ID for state management */
function generateSessionId(): string {
    return crypto.randomUUID();
}

/** Generates the full HTML page structure with Tailwind CSS for styling. */
function getBaseHtml(title: string, content: string): string {
    return `
    <!doctype html>
    <html lang="en">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
        <title>${title}</title>
        <!-- Load Tailwind CSS for modern styling -->
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Inter', sans-serif; background-color: #f3f4f6; }
        </style>
    </head>
    <body class="min-h-screen flex flex-col items-center justify-center p-4">
        <div class="w-full max-w-4xl bg-white p-8 rounded-xl shadow-2xl">
            <h1 class="text-3xl font-bold text-center text-blue-700 mb-6">${title}</h1>
            ${content}
        </div>
    </body>
    </html>
    `;
}

/** Generates a simple login form. */
function renderLoginForm(userType: 'Admin' | 'School/Student', actionUrl: string, error: string | null = null): string {
    const errorHtml = error ? `<p class="text-red-500 mb-4 text-center">${error}</p>` : '';
    let inputFields: string;

    if (userType === 'Admin') {
        inputFields = `
            <input type="text" name="username" placeholder="Admin Username (Try: admin)" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500">
            <input type="password" name="password" placeholder="Password (Try: 1234)" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500">
        `;
    } else { // School/Student
        inputFields = `
            <input type="text" name="school_id" placeholder="School ID (Try: schoolA)" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500">
            <input type="password" name="pin" placeholder="Access PIN (Try: 0000)" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500">
        `;
    }
    
    return `
    <div class="max-w-md mx-auto p-6 bg-gray-50 rounded-lg border border-gray-200">
        <h2 class="text-2xl font-semibold text-center mb-6 text-gray-800">${userType} Login</h2>
        ${errorHtml}
        <form method="POST" action="${actionUrl}" class="space-y-4">
            ${inputFields}
            <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition duration-300">Log In</button>
        </form>
        <div class="mt-6 text-center">
            <a href="/" class="text-sm text-blue-500 hover:text-blue-700">← Back to Home Selection</a>
        </div>
    </div>
    `;
}


// --- Main Request Handler ---

async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const cookies = getCookies(req.headers);
    const sessionId = cookies["kvs_session"];
    let session = sessionId ? SESSION_STORE.get(sessionId) : undefined;
    
    // Helper for redirection
    const redirectTo = (path: string, response?: Response) => {
        const res = response || new Response(null, { status: 302 });
        res.headers.set("Location", path);
        return res;
    };

    // Helper to log out
    if (path === '/logout') {
        if (sessionId) SESSION_STORE.delete(sessionId);
        const res = redirectTo('/');
        // Clear the cookie by setting it to expire immediately
        setCookie(res.headers, { name: "kvs_session", value: "", expires: new Date(0) });
        return res;
    }


    // --- Route: / (Home) ---
    if (path === "/") {
        // Clear session state on landing page
        if (sessionId) SESSION_STORE.delete(sessionId);

        const content = `
        <p class="text-center text-gray-600 mb-10">Welcome to KVS Scholars! Please select your login type to proceed.</p>
        
        <div class="flex flex-col md:flex-row gap-6 justify-center">
            <a href="/admin_login" class="block w-full md:w-1/2">
                <div class="p-6 bg-red-100 hover:bg-red-200 border border-red-300 rounded-lg transition duration-300 ease-in-out transform hover:scale-[1.02] cursor-pointer shadow-md">
                    <h2 class="text-xl font-semibold text-red-700 mb-2">Admin Login</h2>
                    <p class="text-red-600 text-sm">For uploading, organizing, and managing all academic content.</p>
                </div>
            </a>
            <a href="/school_login" class="block w-full md:w-1/2">
                <div class="p-6 bg-green-100 hover:bg-green-200 border border-green-300 rounded-lg transition duration-300 ease-in-out transform hover:scale-[1.02] cursor-pointer shadow-md">
                    <h2 class="text-xl font-semibold text-green-700 mb-2">School/Student Login</h2>
                    <p class="text-green-600 text-sm">For viewing and accessing uploaded textbooks and notes.</p>
                </div>
            </a>
        </div>

        <div class="mt-8 text-center text-sm text-gray-400">
            <p>Database Path for Content Metadata: <code>${KVS_CONTENT_COLLECTION}</code></p>
        </div>
        `;
        return new Response(getBaseHtml("KVS Scholars Home", content), {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
        });
    }

    // --- Route: /admin_login ---
    if (path === "/admin_login") {
        if (req.method === 'POST') {
            const formData = await req.formData();
            const username = formData.get('username');
            const password = formData.get('password');

            if (username === 'admin' && password === '1234') {
                const newSessionId = generateSessionId();
                SESSION_STORE.set(newSessionId, { userRole: 'admin' });
                
                const res = redirectTo('/admin_dashboard');
                // Set the session cookie
                setCookie(res.headers, { name: "kvs_session", value: newSessionId, path: '/', httpOnly: true, secure: true, maxAge: 3600 }); // 1 hour
                return res;
            } else {
                const error = "Invalid credentials. Please try again.";
                return new Response(getBaseHtml("Admin Login", renderLoginForm("Admin", "/admin_login", error)), {
                    status: 401,
                    headers: { "content-type": "text/html; charset=utf-8" },
                });
            }
        }
        return new Response(getBaseHtml("Admin Login", renderLoginForm("Admin", "/admin_login")), {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
        });
    }

    // --- Route: /school_login ---
    if (path === "/school_login") {
        if (req.method === 'POST') {
            const formData = await req.formData();
            const schoolId = formData.get('school_id');
            const pin = formData.get('pin');

            if (schoolId === 'schoolA' && pin === '0000') {
                const newSessionId = generateSessionId();
                SESSION_STORE.set(newSessionId, { userRole: 'school' });
                
                const res = redirectTo('/school_dashboard');
                // Set the session cookie
                setCookie(res.headers, { name: "kvs_session", value: newSessionId, path: '/', httpOnly: true, secure: true, maxAge: 3600 }); // 1 hour
                return res;
            } else {
                const error = "Invalid ID or PIN. Please try again.";
                return new Response(getBaseHtml("School/Student Login", renderLoginForm("School/Student", "/school_login", error)), {
                    status: 401,
                    headers: { "content-type": "text/html; charset=utf-8" },
                });
            }
        }
        return new Response(getBaseHtml("School/Student Login", renderLoginForm("School/Student", "/school_login")), {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
        });
    }

    // --- Route: /admin_dashboard ---
    if (path === "/admin_dashboard") {
        if (!session || session.userRole !== 'admin') {
            return redirectTo('/admin_login');
        }

        const classes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        const subjects = ["Mathematics", "Science", "History", "English"];
        const contentTypes = ["Textbook", "Notes"];

        const content = `
        <div class="p-6 border-2 border-red-400 rounded-lg bg-red-50">
            <h2 class="text-2xl font-semibold text-red-700 mb-4">Admin Dashboard</h2>
            <p class="text-gray-700 mb-6">Welcome, Admin. Use the form below to upload content and manage its metadata.</p>

            <!-- Content Upload Form -->
            <form id="uploadForm" method="POST" action="/upload_content" enctype="multipart/form-data" class="space-y-4">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <!-- Class Selection -->
                    <div>
                        <label for="class" class="block text-sm font-medium text-gray-700">Class (1-12)</label>
                        <select id="class" name="class" required class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md">
                            ${classes.map(c => `<option value="${c}">Class ${c}</option>`).join('')}
                        </select>
                    </div>
                    <!-- Subject Selection -->
                    <div>
                        <label for="subject" class="block text-sm font-medium text-gray-700">Subject</label>
                        <select id="subject" name="subject" required class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md">
                            ${subjects.map(s => `<option value="${s}">${s}</option>`).join('')}
                        </select>
                    </div>
                    <!-- Content Type -->
                    <div>
                        <label for="type" class="block text-sm font-medium text-gray-700">Content Type</label>
                        <select id="type" name="type" required class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md">
                            ${contentTypes.map(t => `<option value="${t}">${t}</option>`).join('')}
                        </select>
                    </div>
                    <!-- Chapter/Description -->
                    <div class="col-span-2 md:col-span-1">
                        <label for="chapter" class="block text-sm font-medium text-gray-700">Chapter / Description</label>
                        <input type="text" id="chapter" name="chapter" required placeholder="e.g., Chapter 1: Real Numbers" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm">
                    </div>
                </div>

                <!-- File Input (Note: Actual file storage is complex and requires external services) -->
                <div class="col-span-full">
                    <label for="file" class="block text-sm font-medium text-gray-700">Select File (PDF, DOCX, etc.)</label>
                    <input type="file" id="file" name="file" required class="mt-1 block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none p-2">
                </div>

                <p class="text-sm text-red-600">Note: In a real app, the file would be saved to a storage service (like Google Cloud Storage), and its public URL would be saved to Firestore at: <code>${KVS_CONTENT_COLLECTION}</code>.</p>
                
                <button type="submit" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition duration-300">Upload Content</button>
            </form>

            <a href="/logout" class="mt-6 inline-block bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition duration-300">Logout</a>
        </div>
        `;
        return new Response(getBaseHtml("Admin Dashboard", content), {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
        });
    }

    // --- Route: /school_dashboard ---
    if (path === "/school_dashboard") {
        if (!session || session.userRole !== 'school') {
            return redirectTo('/school_login');
        }
        
        let contentListHtml = "";
        for (const itemId in MOCK_DATABASE) {
            const item = MOCK_DATABASE[itemId as keyof typeof MOCK_DATABASE];
            contentListHtml += `
            <div class="flex justify-between items-center p-4 mb-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                <div>
                    <p class="text-lg font-semibold text-gray-800">${item.subject} - Class ${item.class}</p>
                    <p class="text-sm text-gray-600">${item.chapter} (${item.type})</p>
                </div>
                <a href="${item.file_url}" target="_blank" class="bg-green-500 hover:bg-green-600 text-white text-sm font-bold py-2 px-4 rounded transition duration-300">View Content</a>
            </div>
            `;
        }

        const content = `
        <div class="p-6 border-2 border-green-400 rounded-lg bg-green-50">
            <h2 class="text-2xl font-semibold text-green-700 mb-4">School/Student Dashboard</h2>
            <p class="text-gray-700 mb-6">Welcome! Here is the latest content available for viewing.</p>

            <h3 class="text-xl font-medium text-gray-800 mb-3">Available Resources:</h3>
            ${contentListHtml || '<p class="text-gray-500">No content uploaded yet.</p>'}
            <a href="/logout" class="mt-6 inline-block bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition duration-300">Logout</a>
        </div>
        `;
        return new Response(getBaseHtml("School Dashboard", content), {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
        });
    }
    
    // --- Route: /upload_content (POST endpoint - MOCK) ---
    if (path === "/upload_content" && req.method === 'POST') {
        if (!session || session.userRole !== 'admin') {
            return redirectTo('/admin_login');
        }

        // Mock success message since actual file upload/Firestore saving is complex in this environment
        const successMessage = `
            <div class="p-8 bg-green-100 border border-green-400 rounded-lg text-center">
                <h2 class="text-2xl font-bold text-green-700 mb-4">Upload Successful (MOCK)</h2>
                <p class="text-gray-700 mb-6">The metadata for your new content has been saved (in a real app) to Firestore. The file would be stored securely.</p>
                <a href="/admin_dashboard" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition duration-300">Go Back to Dashboard</a>
            </div>
        `;

        return new Response(getBaseHtml("Upload Status", successMessage), {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
        });
    }

    // --- 404 Not Found ---
    return new Response(getBaseHtml("404 Not Found", `
        <div class="text-center p-8 bg-yellow-50 rounded-lg">
            <h2 class="text-4xl font-bold text-yellow-700 mb-4">404</h2>
            <p class="text-gray-600">The page <code>${path}</code> was not found.</p>
            <a href="/" class="mt-6 inline-block text-blue-500 hover:text-blue-700">Go back to Home</a>
        </div>
    `), {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8" },
    });
}

// --- Start Server ---
console.log(`KVS Scholars running on http://localhost:${PORT}/`);
await serve(handler, { port: PORT });
