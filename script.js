(function () {
    'use strict';

    /* ============================================================
       Bidirectional seamless marquee
       Exactly five unique logos, no duplicates. The track is
       distributed with space-between across a width of at least
       1.5x the container, so the visible window is never empty.
       A sinusoidal phase drives the position: velocity passes
       smoothly through zero each time an outermost logo touches
       the edge of the bounding rectangle, reversing direction
       (right-to-left, then left-to-right) with no break or jump.
       ============================================================ */
    var HALF_CYCLE_MS = 20000; /* time spent moving in one direction */
    var TRAVEL_EXTRA_PX = 120; /* minimum travel beyond the container edge */
    var MIN_GAP_PX = 48;       /* minimum separation between adjacent logos */

    var marquee = document.querySelector('.logos-marquee');
    var track = marquee.querySelector('.logos');
    var logos = Array.prototype.slice.call(track.querySelectorAll('img'));
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var cycle = 0;      /* phase in [0, 2): 0->1 moves left, 1->2 moves right */
    var maxOffset = 0;  /* track width - container width */
    var paused = false;
    var lastTime = null;

    function applyTransform() {
        var position = maxOffset * (0.5 - 0.5 * Math.cos(Math.PI * cycle));
        track.style.transform = 'translateX(' + (-position) + 'px)';
    }

    function intrinsicWidth(img) {
        if (img.naturalWidth && img.naturalHeight) {
            return img.offsetHeight * img.naturalWidth / img.naturalHeight;
        }
        return img.offsetWidth;
    }

    function measure() {
        var containerW = marquee.clientWidth;
        var logosW = 0;
        for (var i = 0; i < logos.length; i++) {
            logosW += intrinsicWidth(logos[i]);
        }
        /* Balanced, cohesive distribution: the track is sized so that
           space-between yields even gaps of at least MIN_GAP_PX between
           logos, while still providing at least TRAVEL_EXTRA_PX of
           travel beyond the container edge. The larger constraint wins,
           so the spacing stays consistent on every viewport. */
        var targetW = Math.max(
            Math.ceil(containerW + TRAVEL_EXTRA_PX),
            Math.ceil(logosW + (logos.length - 1) * MIN_GAP_PX)
        );
        track.style.width = targetW + 'px';
        maxOffset = Math.max(0, targetW - containerW);
        applyTransform();
    }

    function tick(now) {
        if (lastTime === null) {
            lastTime = now;
        }
        var dt = now - lastTime;
        lastTime = now;

        if (!paused && maxOffset > 0) {
            cycle = (cycle + dt / HALF_CYCLE_MS) % 2;
            applyTransform();
        }
        requestAnimationFrame(tick);
    }

    /* Freeze the marquee while hovering any logo; resume on mouse leave */
    marquee.addEventListener('mouseenter', function () { paused = true; });
    marquee.addEventListener('mouseleave', function () { paused = false; lastTime = null; });

    window.addEventListener('resize', measure);
    logos.forEach(function (img) { img.addEventListener('load', measure); });

    measure();
    if (!reducedMotion) {
        requestAnimationFrame(tick);
    }

    /* ============================================================
       Zoom-to-center hover interaction (logo strip, founder
       image, and case-study cards)
       mouseenter: the element scales up and centers itself on
       the screen. mouseleave: it smoothly transitions back to
       its original position and size.
       The scale is dynamic: it is capped at the scale that
       keeps the element fully inside the viewport, so the
       zoomed element is perfectly centered and never clips
       or overflows any edge, on any screen size. A viewport
       resize mid-hover re-centers the active clone.
    ============================================================ */
    var ZOOM_SCALE = 2.5;         /* maximum zoom, large viewports */
    var ZOOM_DURATION_MS = 450;
    var RETURN_TIMEOUT_MS = ZOOM_DURATION_MS + 50;
    var ZOOM_EDGE_INSET_PX = 48;  /* total slack: 24px free on every side */

    var activeZoom = null; /* { logo: Element, clone: Element } */

    /* Center the clone on the viewport, scaling it up to
       ZOOM_SCALE but never beyond the scale that keeps it
       fully visible inside the viewport. */
    function centerClone(logo, clone) {
        var rect = logo.getBoundingClientRect();
        var dx = window.innerWidth / 2 - (rect.left + rect.width / 2);
        var dy = window.innerHeight / 2 - (rect.top + rect.height / 2);
        var fitScale = Math.min(
            (window.innerWidth - ZOOM_EDGE_INSET_PX) / rect.width,
            (window.innerHeight - ZOOM_EDGE_INSET_PX) / rect.height
        );
        var scale = Math.min(ZOOM_SCALE, fitScale);
        clone.style.transform =
            'translate(' + dx + 'px, ' + dy + 'px) scale(' + scale + ')';
    }

    /* Re-center the active zoom if the viewport resizes */
    window.addEventListener('resize', function () {
        if (activeZoom !== null) {
            centerClone(activeZoom.logo, activeZoom.clone);
        }
    });

    document.querySelectorAll('.logos img, .founder-img, .card').forEach(function (logo) {
        var clone = null;
        var active = false;
        var returnTimer = null;


        logo.addEventListener('mouseenter', function () {
            if (active) {
                return;
            }
            active = true;

            if (returnTimer !== null) {
                clearTimeout(returnTimer);
                returnTimer = null;
            }

            if (clone === null) {
                var rect = logo.getBoundingClientRect();
                var computed = window.getComputedStyle(logo);
                clone = logo.cloneNode(true);
                clone.removeAttribute('alt');
                clone.setAttribute('aria-hidden', 'true');
                /* Keep the element's own classes on the clone so
                   its component styling survives - a card clone
                   needs .card/.card-<client> for its ::before
                   background layer and text color vars. The
                   inline copies preserve the shape and effects
                   (e.g. the founder image's cyan border/glow) */
                clone.classList.add('logo-clone');
                clone.style.borderRadius = computed.borderRadius;
                clone.style.border = computed.border;
                clone.style.boxShadow = computed.boxShadow;
                clone.style.objectFit = computed.objectFit;
                clone.style.left = rect.left + 'px';
                clone.style.top = rect.top + 'px';
                clone.style.width = rect.width + 'px';
                clone.style.height = rect.height + 'px';
                document.body.appendChild(clone);
                void clone.offsetWidth; /* commit initial position before transitioning */
            }

            logo.classList.add('is-hidden');
            activeZoom = { logo: logo, clone: clone };
            centerClone(logo, clone);
        });

        logo.addEventListener('mouseleave', function () {
            if (!active) {
                return;
            }
            active = false;
            activeZoom = null;

            if (clone !== null) {
                clone.style.transform = 'translate(0px, 0px) scale(1)';
                returnTimer = setTimeout(function () {
                    if (clone !== null) {
                        clone.remove();
                        clone = null;
                    }
                    logo.classList.remove('is-hidden');
                    returnTimer = null;
                }, RETURN_TIMEOUT_MS);
            } else {
                logo.classList.remove('is-hidden');
            }
        });
    });
})();
