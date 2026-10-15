import { useEffect } from "react";
import { Outlet, Route, Routes, useLocation } from "react-router";
import ErrorBoundary from "@/components/ErrorBoundary";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import About from "@/pages/About";
import AccountLayout from "@/pages/account/AccountLayout";
import Dashboard from "@/pages/account/Dashboard";
import InternshipForm from "@/pages/account/InternshipForm";
import Password from "@/pages/account/Password";
import ProfileForm from "@/pages/account/ProfileForm";
import ProjectForm from "@/pages/account/ProjectForm";
import SignIn from "@/pages/account/SignIn";
import FacultyList from "@/pages/FacultyList";
import FacultyMember from "@/pages/FacultyMember";
import Home from "@/pages/Home";
import NotFound from "@/pages/NotFound";
import ProjectDetail from "@/pages/ProjectDetail";
import People from "@/pages/People";
import Projects from "@/pages/Projects";
import ReviewChange from "@/pages/review/ReviewChange";
import ReviewQueue from "@/pages/review/ReviewQueue";
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
        <Route path="projects/:slug" element={<ProjectDetail />} />
        <Route path="faculty" element={<FacultyList />} />
        <Route path="faculty/:slug" element={<FacultyMember />} />
        <Route path="students" element={<Students />} />
        <Route path="students/request" element={<StudentRequest />} />
        <Route path="students/:slug" element={<StudentPage />} />
        <Route path="about" element={<About />} />
        <Route path="account/sign-in" element={<SignIn />} />
        <Route path="account/password" element={<Password />} />
        <Route path="account" element={<AccountLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="profile" element={<ProfileForm />} />
          <Route path="projects/new" element={<ProjectForm />} />
          <Route path="projects/:id" element={<ProjectForm />} />
          <Route path="internships/new" element={<InternshipForm />} />
          <Route path="internships/:id" element={<InternshipForm />} />
        </Route>
        <Route path="people" element={<AccountLayout />}>
          <Route index element={<People />} />
        </Route>
        <Route path="review" element={<AccountLayout reviewer />}>
          <Route index element={<ReviewQueue />} />
          <Route path=":id" element={<ReviewChange />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
