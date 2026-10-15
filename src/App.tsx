import { useEffect } from "react";
import { Outlet, Route, Routes, useLocation } from "react-router";
import ErrorBoundary from "@/components/ErrorBoundary";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import About from "@/pages/About";
import Account from "@/pages/Account";
import Admin from "@/pages/Admin";
import AdminLogin from "@/pages/AdminLogin";
import FacultyList from "@/pages/FacultyList";
import FacultyMember from "@/pages/FacultyMember";
import Home from "@/pages/Home";
import NotFound from "@/pages/NotFound";
import ProjectDetail from "@/pages/ProjectDetail";
import ProjectSubmit from "@/pages/ProjectSubmit";
import Projects from "@/pages/Projects";
import StudentPage from "@/pages/StudentPage";
import StudentRequest from "@/pages/StudentRequest";
import Students from "@/pages/Students";

// Scrolls to the #hash target, or to the top on a new page, as a browser does for real pages.
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function Layout() {
  return (
    <>
      <ScrollToTop />
      <ErrorBoundary>
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10">
          <Outlet />
        </main>
      </ErrorBoundary>
      <SiteFooter />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/submit" element={<ProjectSubmit />} />
        <Route path="projects/:slug" element={<ProjectDetail />} />
        <Route path="projects/:slug/edit" element={<ProjectSubmit />} />
        <Route path="faculty" element={<FacultyList />} />
        <Route path="faculty/:slug" element={<FacultyMember />} />
        <Route path="students" element={<Students />} />
        <Route path="students/request" element={<StudentRequest />} />
        <Route path="students/:slug" element={<StudentPage />} />
        <Route path="about" element={<About />} />
        <Route path="account" element={<Account />} />
        <Route path="admin" element={<Admin />} />
        <Route path="admin/login" element={<AdminLogin />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
