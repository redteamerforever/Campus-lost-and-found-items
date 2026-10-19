// ===== 1. SUPABASE SETUP: paste YOUR values here =====
const SUPABASE_URL = "https://acqqbhaoukjarnijhgte.supabase.co";
const SUPABASE_KEY = "sb_publishable_B6pOoK4snvxsILZmtuPPoQ_ecFBcDLc";
// (never paste the secret / service_role key here)

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== 2. PAGE ELEMENTS =====
const form = document.querySelector(".post-form:not(#loginBox)");
const postBtn = form.querySelector('button[type="submit"]');
const feed = document.getElementById("feed");
const feedStatus = document.getElementById("feedStatus");
const statsBox = document.getElementById("stats");
const cameraInput = document.getElementById("cameraPhoto");
const galleryInput = document.getElementById("galleryPhoto");
const photoStatus = document.getElementById("photoStatus");
const autoBtn = document.getElementById("autoBtn");
const pinBtn = document.getElementById("pinBtn");
const locationStatus = document.getElementById("locationStatus");
const mapBox = document.getElementById("mapBox");

const authBar = document.getElementById("authBar");
const loginBox = document.getElementById("loginBox");
const stepEmail = document.getElementById("stepEmail");
const stepCode = document.getElementById("stepCode");
const loginEmail = document.getElementById("loginEmail");
const
