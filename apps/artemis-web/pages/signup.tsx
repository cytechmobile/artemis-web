import dynamic from 'next/dynamic';
import Head from 'next/head';
import React from 'react';

const SignupPage: React.FunctionComponent<{}> = () => {
  const Footer = dynamic(() => import('../components/footer/footer'));
  const SignUpComponent = dynamic(() =>
    import('../components/sign-up/sign-up')
  );
  const Header = dynamic(() => import('../components/header/header'));
  return (
    <>
      <Head>
        overview
        <title>ARTEMIS - Sign Up</title>
      </Head>
      <div id="page-container">
        <Header />
        <div id="content-wrap" style={{ paddingBottom: '5rem' }}>
          <div className="container d-flex align-items-center flex-column">
            <SignUpComponent />
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
};

export default SignupPage;
