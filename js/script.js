// Main script file for Luca Valli portfolio website

document.addEventListener('DOMContentLoaded', function() {
  'use strict';
  
  // Initialize AOS (Animate On Scroll)
  AOS.init({
      duration: 800,
      easing: 'ease-in-out',
      once: true,
      mirror: false
  });
  
  // Initialize TypedJS for hero section
  const typedText = document.querySelector('.typed-text');
  if (typedText) {
      let typed = new Typed('.typed-text', {
          strings: [
              'Web Developer',
              'Social Media Manager',
              'Fotografo',
              'Videomaker',
              'Creatore di Fantasy Games'
          ],
          typeSpeed: 50,
          backSpeed: 30,
          backDelay: 2000,
          loop: true,
          showCursor: true
      });
  }
  
  // Initialize SimpleLightbox for gallery
  const galleryLinks = document.querySelectorAll('.gallery-link');
  if (galleryLinks.length > 0) {
      new SimpleLightbox('.gallery-link', {
          /* options */
          captionsData: 'alt',
          captionDelay: 250
      });
  }
  
  // Navbar scroll effect
  initNavbarScroll();
  
  // Initialize smooth scrolling for internal links
  initSmoothScroll();
  
// Initialize back to top button
initBackToTop();
    
// Add active class to nav items on scroll
initScrollSpy();
});

// Navbar scroll effect
function initNavbarScroll() {
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});
}

// Smooth scrolling for internal links
function initSmoothScroll() {
const links = document.querySelectorAll('a[href^="#"]');

links.forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;
        
        const targetElement = document.querySelector(targetId);
        const navbarHeight = document.querySelector('.navbar').offsetHeight;
        
        if (targetElement) {
            window.scrollTo({
                top: targetElement.offsetTop - navbarHeight,
                behavior: 'smooth'
            });
            
            // Close mobile menu if open
            const navbarToggler = document.querySelector('.navbar-toggler');
            const navbarCollapse = document.querySelector('.navbar-collapse');
            if (navbarCollapse.classList.contains('show')) {
                navbarToggler.click();
            }
        }
    });
});
}

// Back to top button
function initBackToTop() {
const backToTopButton = document.querySelector('.back-to-top');

window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
        backToTopButton.classList.add('visible');
    } else {
        backToTopButton.classList.remove('visible');
    }
});
}

// Scroll spy (highlight nav links)
function initScrollSpy() {
const sections = document.querySelectorAll('section, header');
const navLinks = document.querySelectorAll('.nav-link');

window.addEventListener('scroll', () => {
    let current = '';
    const navbarHeight = document.querySelector('.navbar').offsetHeight;
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop - navbarHeight - 100;
        const sectionHeight = section.offsetHeight;
        
        if (window.scrollY >= sectionTop && window.scrollY < sectionTop + sectionHeight) {
            current = section.getAttribute('id');
        }
    });
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
            link.classList.add('active');
        }
    });
});
}

// Dynamic year for copyright in footer
const yearSpan = document.querySelector('.year');
if (yearSpan) {
yearSpan.textContent = new Date().getFullYear();
}

// Gallery filter functionality (if needed)
const galleryFilters = document.querySelectorAll('.gallery-filter');
if (galleryFilters.length > 0) {
galleryFilters.forEach(filter => {
    filter.addEventListener('click', function(e) {
        e.preventDefault();
        
        // Remove active class from all filters
        galleryFilters.forEach(item => {
            item.classList.remove('active');
        });
        
        // Add active class to current filter
        this.classList.add('active');
        
        const filterValue = this.getAttribute('data-filter');
        const galleryItems = document.querySelectorAll('.gallery-item');
        
        galleryItems.forEach(item => {
            if (filterValue === 'all') {
                item.style.display = 'block';
            } else if (item.classList.contains(filterValue)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    });
});
}

// Preloader (if needed)
window.addEventListener('load', function() {
const preloader = document.querySelector('.preloader');
if (preloader) {
    preloader.classList.add('fade-out');
    setTimeout(() => {
        preloader.style.display = 'none';
    }, 500);
}
});

// Custom cursor (optional modern touch)
function initCustomCursor() {
const cursor = document.createElement('div');
cursor.classList.add('custom-cursor');
const cursorDot = document.createElement('div');
cursorDot.classList.add('cursor-dot');
const cursorCircle = document.createElement('div');
cursorCircle.classList.add('cursor-circle');

cursor.appendChild(cursorDot);
cursor.appendChild(cursorCircle);
document.body.appendChild(cursor);

document.addEventListener('mousemove', (e) => {
    gsap.to(cursorDot, {
        x: e.clientX,
        y: e.clientY,
        duration: 0,
        ease: 'power2.out'
    });
    
    gsap.to(cursorCircle, {
        x: e.clientX,
        y: e.clientY,
        duration: 0.3,
        ease: 'power2.out'
    });
});

document.addEventListener('mousedown', () => {
    cursorCircle.classList.add('click');
});

document.addEventListener('mouseup', () => {
    cursorCircle.classList.remove('click');
});

const links = document.querySelectorAll('a, button');
links.forEach(link => {
    link.addEventListener('mouseenter', () => {
        cursorCircle.classList.add('hover');
    });
    
    link.addEventListener('mouseleave', () => {
        cursorCircle.classList.remove('hover');
    });
});
}

// Initialize parallax effect
function initParallax() {
const parallaxElements = document.querySelectorAll('.parallax');

window.addEventListener('scroll', () => {
    const scrolled = window.scrollY;
    
    parallaxElements.forEach(element => {
        const speed = element.dataset.speed || 0.3;
        const yPos = -(scrolled * speed);
        element.style.transform = `translateY(${yPos}px)`;
    });
});
}

// Call additional functions if needed
// initCustomCursor();
// initParallax();