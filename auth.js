document.addEventListener('DOMContentLoaded', () => {
    const navMenu = document.getElementById('nav-menu');
    const headerContainer = document.querySelector('.header .container');
    const user = JSON.parse(localStorage.getItem('petples_user'));

    // 기본 네비게이션 메뉴
    const baseMenu = `
        <li><a href="inquiry.html">1:1 문의</a></li>
        <li><a href="community.html">커뮤니티</a></li>
        <li><a href="matching.html">산책 메이트 찾기</a></li>
        <li><a href="local.html">우리 동네</a></li>
    `;
    navMenu.innerHTML = baseMenu; // '1:1 문의'를 포함하여 메뉴를 설정합니다.

    // 인증 관련 메뉴를 담을 새로운 ul 생성
    const authNav = document.createElement('ul');
    authNav.className = 'auth-nav';
    headerContainer.appendChild(authNav);

    if (user) {
        // 로그인 상태일 때 메뉴
        authNav.innerHTML = `
            <li><a href="chat_list.html">대화</a></li>
            <li><a href="mypage.html">마이페이지</a></li>
            <li><a href="#" id="logout-button">로그아웃</a></li>
        `;
    } else {
        // 로그아웃 상태일 때 메뉴
        authNav.innerHTML = `
            <li><a href="login.html">로그인</a></li>
            <li><a href="signup.html" class="button-signup">회원가입</a></li>
        `;
    }

    // 로그아웃 버튼에 이벤트 리스너 추가
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            // 로그아웃 시 확인 메시지
            if (!confirm('로그아웃 하시겠습니까?')) return;

            localStorage.removeItem('petples_user');
            alert('로그아웃 되었습니다.');
            window.location.href = 'index.html';
        });
    }
});